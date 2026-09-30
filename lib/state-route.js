// 本机状态路由：把「DSH 现在在干什么」以**无需认证**的 JSON 暴露给桌面宠物进程。
//
// 为什么必须由本插件提供：DSH 官方 /api/* 在未携带凭据时一律 401（实测），
// 而第三方插件自注册的 named route 在 HTTP 分发表里**先于** fallback 命中、不走认证
// （packages/host/webserver/src/index.ts）。对照：/memory-eternal/api/overview 实测 200。
//
// 两条必须遵守的接缝约束（来自 DSH 0.2.0 源码取证）：
//   1) 路径**不能**放在 /api 前缀下 —— 那个前缀被 client-connection 占用，
//      重叠会撞 `duplicate prefix route`，或落进它的浏览器信任栅栏。
//   2) webServer.register() **不是 effect**，必须自己包 ctx.effect(...)，
//      否则插件卸载后路由会残留。

import { jsonRoute as json } from './http-json.js'

/** 路由前缀（避开 /api）。 */
export const STATE_PREFIX = '/beast-tamer/api'

/** 快照缓存时间：宠物 1.2s 轮询一次，50ms 内直接复用，避免每次重折投影。 */
const CACHE_MS = 50

/**
 * 组装一份状态快照。
 * @param {object} ctx cordis 上下文。
 * @param {string|null} requestedSessionId 调用方指定的会话 id（host 侧没有「当前会话」概念，只能外部告知或启发式挑选）。
 * @returns {Promise<object>} 快照。
 */
export async function buildSnapshot(ctx, requestedSessionId) {
  const agents = safeGet(ctx, 'agents')
  const sessions = safeGet(ctx, 'sessions')
  const projections = safeGet(ctx, 'sessionProjections')

  // 每一处服务调用都必须自带降级：这个路由会在任何时刻被外部轮询，
  // 一次未捕获的异常就会把 500 抛给宠物（甚至更糟），所以粒度放到单个调用上。
  let live = []
  if (typeof agents?.list === 'function') {
    try {
      const listed = agents.list()
      live = Array.isArray(listed) ? listed : []
    } catch {
      live = []
    }
  }
  const runningAgents = live.filter((agent) => agent?.status === 'running')
  const selectedId =
    (typeof requestedSessionId === 'string' && requestedSessionId.trim() !== '' ? requestedSessionId.trim() : undefined)
    ?? runningAgents[0]?.id
    ?? live[0]?.id
    ?? null

  let agent
  if (selectedId !== null && typeof agents?.get === 'function') {
    try {
      agent = agents.get(selectedId)
    } catch {
      agent = undefined
    }
  }

  let session
  if (selectedId !== null && typeof sessions?.get === 'function') {
    try {
      session = sessions.get(selectedId)
    } catch {
      session = undefined
    }
  }

  let goal = null
  let todos = null
  let title = null
  if (session !== undefined && typeof projections?.snapshot === 'function') {
    try {
      // 一次 snapshot 同时取三个键；未装载对应投影单元时 key 会**缺席**（不是 null）
      const snap = projections.snapshot(session, ['goal', 'todos', 'title'])
      const values = snap?.values ?? {}
      goal = values.goal ?? null
      todos = values.todos ?? null
      title = values.title ?? null
    } catch {
      /* 投影单元未装载属正常能力缺失，静默降级 */
    }
  }

  const items = Array.isArray(todos) ? todos : []
  const completed = items.filter((item) => item?.status === 'completed').length
  const inProgress = items
    .filter((item) => item?.status === 'in_progress')
    .map((item) => String(item?.content ?? '').slice(0, 80))
    .filter((text) => text !== '')

  const cwd = session?.header?.cwd
  const base = typeof cwd === 'string' && cwd !== ''
    ? cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop()
    : ''
  const displayTitle = typeof title === 'string' && title !== '' ? title : (base !== '' ? base : null)

  return {
    ok: true,
    at: Date.now(),
    // 宠物只需要这四项即可驱动情绪与头顶进度
    connected: true,
    running: agent?.status === 'running',
    sessions: live.length,
    sessionId: selectedId,
    title: displayTitle ?? '',
    goal: goal === null
      ? null
      : {
        objective: String(goal?.goal?.objective ?? '').slice(0, 120),
        phase: goal?.goal?.phase ?? 'active',
        blockedReason: goal?.goal?.blockedReason ?? null,
        rounds: Number(goal?.roundsStarted ?? 0),
        maxRounds: Number(goal?.goal?.maxGoalRounds ?? 0),
      },
    todo: items.length === 0
      ? null
      : {
        total: items.length,
        done: completed,
        current: inProgress[0] ?? '',
      },
  }
}

/**
 * 把状态路由注册到 webServer。
 * @param {object} ctx 插件 ctx（需要 effect）。
 * @param {object} webServer webServer 服务。
 * @param {object} [options] 可选项。
 * @param {() => object} [options.extra] 追加字段（例如插件自身配置）。
 * @param {(message: string) => void} [options.log] 诊断日志回调。
 * @returns {boolean} 是否注册成功。
 */
export function registerStateRoute(ctx, webServer, options = {}) {
  if (!webServer || typeof webServer.register !== 'function') return false
  const cache = { at: 0, body: null }

  const route = {
    kind: 'prefix',
    path: STATE_PREFIX,
    handler: async (req, res) => {
      try {
        const url = new URL(req?.url ?? '/', 'http://localhost')
        if (url.pathname !== `${STATE_PREFIX}/state`) {
          return json(res, 404, { ok: false, error: 'not found' })
        }
        const now = Date.now()
        if (cache.body === null || now - cache.at > CACHE_MS) {
          const snapshot = await buildSnapshot(ctx, url.searchParams.get('session'))
          const extra = typeof options.extra === 'function' ? options.extra() : undefined
          cache.body = extra && typeof extra === 'object' ? { ...snapshot, ...extra } : snapshot
          cache.at = now
        }
        return json(res, 200, cache.body)
      } catch (error) {
        try {
          return json(res, 500, { ok: false, error: String(error?.message ?? error) })
        } catch {
          return undefined
        }
      }
    },
  }

  try {
    // register 返回 disposer，但它不是 effect：必须挂进 ctx.effect 才能随插件卸载撤销
    ctx.effect(() => webServer.register(route), 'beast-tamer: state route')
    options.log?.(`状态路由已注册（${STATE_PREFIX}/state）`)
    return true
  } catch (error) {
    options.log?.(`状态路由注册失败：${error?.message ?? error}`)
    return false
  }
}

/** 宽容取服务：ctx.get 可能不存在或抛错。 */
function safeGet(ctx, name) {
  try {
    if (ctx && typeof ctx.get === 'function') return ctx.get(name)
    return ctx?.[name]
  } catch {
    return undefined
  }
}
