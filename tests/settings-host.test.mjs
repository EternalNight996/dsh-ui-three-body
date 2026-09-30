// host 侧设置兼容层回归测试：用「假 ctx 真跑」覆盖 DSH 的两代 settings 形状。
//
// 测试策略照抄 memory-eternal 的成功做法：
//   1) 先钉一个「旧写法必然抛错」的锚点断言，让哪天有人改回 0.1-only 写法时立刻变红；
//   2) 再断言新写法在两种形状下都能挂载并读到正确值；
//   3) 最后断言 volatile 活引用被递归解引用、且「每次都重新解引用（不缓存快照）」。

import test from 'node:test'
import assert from 'node:assert/strict'
import z from '@deepseek-ai/schemastery'
import {
  bindSettings,
  isVolatileRef,
  plainConfig,
  markAllVolatile,
  settingsEntryId,
} from '../lib/settings-host.js'

const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

/** 造一个 cosmokit 风格的 volatile 活引用：值可变，.get() 每次都读最新。 */
function volatileRef(initial) {
  const box = { value: initial }
  return {
    box,
    ref: {
      get: () => box.value,
      [VOLATILE_WRITE]: (next) => {
        box.value = next
      },
    },
  }
}

function makeSchema() {
  return z.object({
    enabled: z.boolean().default(true),
    mode: z.union(['minimal', 'balanced', 'full']).default('balanced'),
    kernelOverride: z.string().default(''),
  })
}

/** 假 ctx：只实现兼容层真正用到的那几件事。 */
function makeCtx({ settings, hasEffect = true, hasOn = true } = {}) {
  const effects = []
  const listeners = new Map()
  const ctx = {
    fiber: { entry: { options: { id: 'beast-tamer' } } },
    get: (key) => (key === 'settings' ? settings : undefined),
    effect(callback, label) {
      effects.push({ label })
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  if (hasOn) {
    ctx.on = (event, handler) => {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return () => {
        const rest = (listeners.get(event) ?? []).filter((item) => item !== handler)
        listeners.set(event, rest)
      }
    }
  }
  return { ctx, effects, listeners }
}

// ── 锚点：旧写法在 0.2 形状下必然抛错 ───────────────────────────────────────
test('锚点：0.2 形状（无 register）下，旧的 ctx.settings.register 写法必然抛 TypeError', () => {
  const formsService = { configure() {}, describe: () => [], update: async () => {} }
  const { ctx } = makeCtx({ settings: formsService })
  assert.throws(() => ctx.settings.register('beast-tamer', makeSchema(), {}), TypeError)
})

// ── 路径 A：≤0.1.5 注册表形状 ──────────────────────────────────────────────
test('registry 形状：register 被调用且 base 透传，get 读到句柄值', () => {
  const calls = []
  const box = { value: { enabled: false, mode: 'full', kernelOverride: 'X' } }
  const service = {
    register(ns, schema, options) {
      calls.push({ ns, schema, options })
      return { get: () => box.value, watch: () => () => {}, update: async () => {} }
    },
  }
  const { ctx } = makeCtx({ settings: service })
  const schema = makeSchema()
  const settings = bindSettings(ctx, schema, undefined, { namespace: 'beast-tamer' })

  assert.equal(settings.shape, 'registry')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].ns, 'beast-tamer')
  assert.equal(calls[0].schema, schema)
  assert.deepEqual(calls[0].options, { base: {} })
  assert.deepEqual(settings.get(), { enabled: false, mode: 'full', kernelOverride: 'X' })
})

test('registry 形状：watch 透传订阅，且退订函数可用', () => {
  let subscribeCount = 0
  let unsubscribeCount = 0
  const service = {
    register: () => ({
      get: () => ({ enabled: true }),
      watch: (cb) => {
        subscribeCount += 1
        return () => {
          unsubscribeCount += 1
          cb()
        }
      },
      update: async () => {},
    }),
  }
  const { ctx } = makeCtx({ settings: service })
  const settings = bindSettings(ctx, makeSchema(), undefined, { namespace: 'beast-tamer' })
  let hits = 0
  const off = settings.watch(() => {
    hits += 1
  })
  assert.equal(subscribeCount, 1)
  assert.equal(typeof off, 'function')
  off()
  assert.equal(unsubscribeCount, 1)
  assert.equal(hits, 1)
})

test('registry 形状：句柄抛错时 get 退化为 schema 默认值而不是崩掉', () => {
  const service = {
    register: () => ({
      get: () => {
        throw new Error('boom')
      },
      watch: () => () => {},
    }),
  }
  const { ctx } = makeCtx({ settings: service })
  const settings = bindSettings(ctx, makeSchema(), undefined, { namespace: 'beast-tamer' })
  assert.equal(settings.get().mode, 'balanced')
  assert.equal(settings.get().enabled, true)
})

// ── 路径 B：≥0.1.7 表单形状 ───────────────────────────────────────────────
test('forms 形状：登记 configure({auto:false})，且不调用 register', () => {
  const configureCalls = []
  const service = {
    configure: (presentation, owner) => {
      configureCalls.push({ presentation, owner })
      return () => {}
    },
    describe: () => [],
    update: async () => {},
  }
  const { ctx, effects } = makeCtx({ settings: service })
  const settings = bindSettings(ctx, makeSchema(), { enabled: true }, { namespace: 'beast-tamer' })

  assert.equal(settings.shape, 'forms')
  assert.equal(effects.length, 1)
  assert.equal(configureCalls.length, 1)
  assert.deepEqual(configureCalls[0].presentation, { auto: false })
  assert.equal(configureCalls[0].owner, ctx.fiber)
})

test('forms 形状：get 读的是活引用本身，不是启动时的快照', () => {
  const service = { configure: () => () => {}, describe: () => [], update: async () => {} }
  const live = { enabled: true, mode: 'balanced', kernelOverride: '' }
  const { ctx } = makeCtx({ settings: service })
  const settings = bindSettings(ctx, makeSchema(), live, { namespace: 'beast-tamer' })

  assert.equal(settings.get().mode, 'balanced')
  // 宿主原地热更新后，无需重新绑定就必须能读到新值 → 证明没有缓存快照
  live.mode = 'full'
  assert.equal(settings.get().mode, 'full')
})

test('forms 形状：volatile 活引用被递归解引用（含嵌套对象与数组）', () => {
  const service = { configure: () => () => {}, describe: () => [], update: async () => {} }
  const mode = volatileRef('minimal')
  const enabled = volatileRef(true)
  const override = volatileRef('')
  const profile = volatileRef({ x: 1, y: 2 })
  const itemA = volatileRef('a')
  const itemB = volatileRef('b')
  const live = {
    enabled: enabled.ref,
    mode: mode.ref,
    kernelOverride: override.ref,
    petPos: profile.ref,
    vaultProfiles: [itemA.ref, itemB.ref],
  }
  const { ctx } = makeCtx({ settings: service })
  const settings = bindSettings(ctx, makeSchema(), live, { namespace: 'beast-tamer' })

  // 关键：解引用后必须是普通值，JSON.stringify 不能出现 {}
  assert.equal(settings.get().mode, 'minimal')
  assert.equal(settings.get().enabled, true)
  assert.deepEqual(settings.get().petPos, { x: 1, y: 2 })
  assert.deepEqual(settings.get().vaultProfiles, ['a', 'b'])
  assert.equal(JSON.stringify(settings.get()).includes('{}'), false)

  // 活引用背后的值变了，下一次 get 必须看到新值
  mode.box.value = 'full'
  assert.equal(settings.get().mode, 'full')
})

test('forms 形状：watch 绑定 loader/volatile-update 事件', () => {
  const service = { configure: () => () => {}, describe: () => [], update: async () => {} }
  const { ctx, listeners } = makeCtx({ settings: service })
  const settings = bindSettings(ctx, makeSchema(), { enabled: true }, { namespace: 'beast-tamer' })

  let hits = 0
  const off = settings.watch(() => {
    hits += 1
  })
  assert.equal((listeners.get('loader/volatile-update') ?? []).length, 1)

  for (const handler of listeners.get('loader/volatile-update')) handler()
  assert.equal(hits, 1)

  off()
  assert.equal((listeners.get('loader/volatile-update') ?? []).length, 0)
})

test('forms 形状：update 走 describe() 取 revision，revision 冲突时自动重试一次', () => {
  const updates = []
  let describeCalls = 0
  const service = {
    configure: () => () => {},
    describe: () => {
      describeCalls += 1
      return describeCalls === 1 ? [{ ns: 'beast-tamer', revision: 3 }] : [{ ns: 'beast-tamer', revision: 4 }]
    },
    update: async (ns, patch, revision) => {
      updates.push({ ns, patch, revision })
      if (revision !== 4) throw new Error('settings: entry changed since revision 3 (SETTINGS_CONFLICT)')
      return { revision }
    },
  }
  const { ctx } = makeCtx({ settings: service })
  const settings = bindSettings(ctx, makeSchema(), { enabled: true }, { namespace: 'beast-tamer' })

  return settings.update({ mode: 'full' }).then(() => {
    assert.equal(updates.length, 2)
    assert.equal(updates[0].revision, 3)
    assert.equal(updates[1].revision, 4)
    assert.equal(updates[1].ns, 'beast-tamer')
    assert.deepEqual(updates[1].patch, { mode: 'full' })
  })
})

test('forms 形状：update 遇非 revision 类错误要原样抛出，不能吞', () => {
  const service = {
    configure: () => () => {},
    describe: () => [{ ns: 'beast-tamer', revision: 1 }],
    update: async () => {
      throw new Error('disk is on fire')
    },
  }
  const { ctx } = makeCtx({ settings: service })
  const settings = bindSettings(ctx, makeSchema(), { enabled: true }, { namespace: 'beast-tamer' })
  return assert.rejects(() => settings.update({ mode: 'full' }), /disk is on fire/)
})

test('forms 形状：命名空间取 Loader 条目 id，写配置时用它而不是插件自报 ns', () => {
  const updates = []
  const service = {
    configure: () => () => {},
    describe: () => [{ ns: 'dsh-ui-three-body', revision: 0 }],
    update: async (ns, patch, revision) => {
      updates.push(ns)
      return { ns, revision }
    },
  }
  const { ctx } = makeCtx({ settings: service })
  ctx.fiber = { entry: { options: { id: 'dsh-ui-three-body' } } }
  const settings = bindSettings(ctx, makeSchema(), { enabled: true }, { namespace: 'beast-tamer' })
  assert.equal(settings.entryId, 'dsh-ui-three-body')
  return settings.update({ mode: 'full' }).then(() => {
    assert.deepEqual(updates, ['dsh-ui-three-body'])
  })
})

// ── 路径 C：两代都没有 → 只读降级 ──────────────────────────────────────────
test('defaults 形状：settings 服务完全缺失时不抛错，退化为 schema 默认值', () => {
  const { ctx } = makeCtx({ settings: undefined, hasOn: false })
  const settings = bindSettings(ctx, makeSchema(), undefined, { namespace: 'beast-tamer' })

  assert.equal(settings.shape, 'defaults')
  assert.deepEqual(settings.get(), { enabled: true, mode: 'balanced', kernelOverride: '' })
  assert.equal(typeof settings.watch(() => {}), 'function')
  assert.equal(typeof settings.watch(() => {}), 'function')
})

test('defaults 形状：update 给出可读错误而不是 TypeError', () => {
  const { ctx } = makeCtx({ settings: undefined, hasOn: false })
  const settings = bindSettings(ctx, makeSchema(), undefined, { namespace: 'beast-tamer' })
  return assert.rejects(() => settings.update({ mode: 'full' }), /不支持写配置/)
})

// ── 工具函数 ──────────────────────────────────────────────────────────────
test('isVolatileRef / plainConfig：品牌判定与深度保护', () => {
  const { ref } = volatileRef('v')
  assert.equal(isVolatileRef(ref), true)
  assert.equal(isVolatileRef({ get: () => 1 }), false)
  assert.equal(isVolatileRef(null), false)
  assert.equal(plainConfig(ref), 'v')
  assert.deepEqual(plainConfig({ a: [ref, 1], b: null }), { a: ['v', 1], b: null })
})

test('markAllVolatile：给每个字段打 volatile，且不使用链式 .volatile()', () => {
  const schema = makeSchema()
  const marked = markAllVolatile(schema)
  assert.equal(marked, 3)
  for (const field of Object.values(schema.dict)) {
    assert.equal(field.meta.volatile, true)
    // 原有 meta.default 必须保留
    assert.notEqual(field.meta.default, undefined)
  }
})

test('markAllVolatile：遇到畸形 schema 不抛错', () => {
  assert.equal(markAllVolatile(undefined), 0)
  assert.equal(markAllVolatile({}), 0)
  assert.equal(markAllVolatile({ dict: null }), 0)
})

test('settingsEntryId：优先 fiber.entry.options.id，探测不到时用兜底值', () => {
  assert.equal(settingsEntryId({ fiber: { entry: { options: { id: 'a' } } } }, 'fb'), 'a')
  assert.equal(settingsEntryId({ fiber: { entry: { id: 'b' } } }, 'fb'), 'b')
  assert.equal(settingsEntryId({}, 'fb'), 'fb')
  assert.equal(settingsEntryId(null, 'fb'), 'fb')
})
