// 驯兽师（host 侧）：内核注入 + 设置命名空间 + 需求剖析工具。
//
// 职责：
// 1. 注册 `beast-tamer` 设置命名空间（enabled / mode / lang / petEnabled / petPos / analyzeTool / kernelOverride）。
// 2. 监听设置，在开启时把「驯兽师内核」作为 system prompt 分段注入，关闭时移除；
//    内核文本随 mode / lang / kernelOverride 实时热更新。
// 3. 可选注册 `beast_analyze` 工具：联动当前模型把原始需求剖析成规范 markdown 计划。
//
// 「联动当前使用的 AI 模型」是自动的：内核只是组装进每次请求 system prompt
// 的一个分段，无论会话当前用哪个模型都会生效；beast_analyze 则复用同一 llm 服务。

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { kernelForMode, KERNEL_SECTION, KERNEL_ORDER } from './lib/kernel.js'

export const name = 'beast-tamer'
export const inject = ['systemPrompt', 'settings']

export const Config = z.object({
  enabled: z.boolean().default(true),
  aiMode: z.boolean().default(true),
  mode: z.union(['minimal', 'balanced', 'full']).default('balanced'),
  lang: z.union(['zh', 'en']).default('zh'),
  tone: z.union(['arrogant', 'gentle', 'warm']).default('arrogant'),
  selfName: z.string().default('本尊'),
  userTitle: z.string().default('主上'),
  petEnabled: z.boolean().default(true),
  petSize: z.number().default(64),
  eyeTheme: z.union(['cyan', 'purple', 'void', 'starfield', 'sharingan', 'mangekyo', 'rinnegan', 'sophon', 'byakugan', 'blood', 'corpse', 'demon']).default('cyan'),
  petPos: z.union([z.object({ x: z.number(), y: z.number() }), z.const(null)]).default(null),
  ghostMode: z.boolean().default(false),
  ghostIdle: z.number().default(8),
  ghostRoam: z.boolean().default(true),
  ghostBlink: z.boolean().default(true),
  aliveMode: z.boolean().default(true),
  analyzeTool: z.boolean().default(false),
  kernelOverride: z.string().default(''),
  onboarded: z.boolean().default(false),
})

export function apply(ctx, config) {
  // base 传 composition 配置：settings 层序 = schema 默认值 → base(config) → 用户覆盖。
  const settings = ctx.settings.register('beast-tamer', Config, { base: config ?? {} })

  ctx.effect(() => {
    let disposeSection = null

    const resolveText = (cfg) => {
      const override = cfg && typeof cfg.kernelOverride === 'string' ? cfg.kernelOverride.trim() : ''
      if (override) return override
      return kernelForMode(cfg && cfg.mode, cfg && cfg.lang, {
        tone: cfg && cfg.tone,
        selfName: cfg && cfg.selfName,
        userTitle: cfg && cfg.userTitle,
      })
    }

    const refresh = (cfg) => {
      if (disposeSection) {
        const dispose = disposeSection
        disposeSection = null
        dispose()
      }
      if (!cfg || cfg.enabled === false || cfg.aiMode !== true) return
      const text = resolveText(cfg)
      if (!text) return
      disposeSection = ctx.systemPrompt.section({
        name: KERNEL_SECTION,
        order: KERNEL_ORDER,
        text,
      })
    }

    refresh(settings.get())
    const unwatch = settings.watch(refresh)

    return () => {
      if (typeof unwatch === 'function') unwatch()
      if (disposeSection) {
        const dispose = disposeSection
        disposeSection = null
        dispose()
      }
    }
  }, 'beast-tamer: kernel section')

  // 可选：beast_analyze 需求剖析工具（联动当前模型）。默认关，尊重「最少 token」；
  // 需要「一键生成规范 markdown 计划」时在设置页开启。
  const llm = ctx.get('llm')
  const tools = ctx.get('tools')
  if ((settings.get() && settings.get().analyzeTool) === true && llm !== undefined && tools !== undefined) {
    tools.register(defineTool({
      name: 'beast_analyze',
      description:
        '把用户的原始需求剖析成一份规范的 markdown 计划（需求剖析 → 目标 → 分步计划 → 验收标准），' +
        '供驯兽师流程「呈策给用户审核」使用。收到「做 X / 帮我 X」类需求且需要产出正式计划时调用；' +
        '产出的计划应通过 ask_user_question 请用户确认（准/驳）后再执行。',
      parameters: {
        requirement: { type: 'string', required: true, description: '用户的原始需求（原话或简述）' },
        context: { type: 'string', required: false, description: '补充背景：技术栈、预算、时间、已有资源等' },
      },
      output: {
        schema: { type: 'string' },
        render(_a, v) { return [{ type: 'text', text: v }] },
      },
      timeoutMs: 60000,
      async execute(args) {
        const req = String(args.requirement || '').trim()
        if (!req) return '（未提供需求，无法剖析）'
        const route = await resolveRoute(llm)
        if (!route) return '（当前没有可用模型，无法剖析；请先在模型选择里配置好模型）'
        const ctxExtra = String(args.context || '').trim().slice(0, 1500)
        const system = [
          '你是需求剖析引擎。按「第一性原理」把用户的原始需求拆解，输出一份极简规范 markdown 计划。',
          '严格按下面四节输出，不要多余开场或结语：',
          '## 需求剖析',
          '- 形态（纯软件 / 软硬结合）',
          '- 交付（一次 / 分段）',
          '- 结构（前端 / 后端 / 管理端）',
          '- 审美与风格',
          '- 关键约束与风险',
          '## 目标',
          '一句话可验证目标：做完是什么样、怎样算完成。',
          '## 分步计划',
          '按顺序列出最小可行步骤（每步一行，可勾选）。',
          '## 验收标准',
          '可核对的完成判据（列表）。',
          '语言与用户一致；极简，不写废话。',
        ].join('\n')
        const prompt = '用户需求：' + req + (ctxExtra ? '\n补充背景：' + ctxExtra : '')
        try {
          const assembler = new BlockAssembler()
          const messages = [createUserMessage({
            content: [{ type: 'text', text: prompt }],
            source: { kind: 'plugin', plugin: 'beast-tamer' },
          })]
          const options = {
            provider: route.provider,
            model: route.model,
            messages,
            system,
            maxTokens: 1200,
            reasoningEffort: 'off',
            purpose: 'beast-analyze',
            signal: AbortSignal.timeout(60000),
          }
          for await (const chunk of llm.stream(options)) assembler.push(chunk)
          const text = assembler.blocks().filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
          return text || '（模型未能产出计划，请重试）'
        } catch {
          return '（剖析失败，请重试或直接按驯兽流程手动剖析）'
        }
      },
    }))
  }
}

// 取第一个 provider 的旗舰模型（目录通常旗舰在前）。与内核一样复用 dsh 已配模型。
async function resolveRoute(llm) {
  try {
    const providers = llm.listProviders()
    if (!providers || providers.length === 0) return null
    const models = await llm.listModels(providers[0].id)
    if (!models || models.length === 0) return null
    return { provider: providers[0].id, model: models[0].id }
  } catch {
    return null
  }
}
