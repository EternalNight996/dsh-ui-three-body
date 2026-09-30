// 设置作用域适配层（client 侧）——DSH 0.1.x 与 0.2.x 双形状归一。
//
// 背景：DSH 0.2.0 删除了客户端 `settingsScope` 服务（commit 601d6761e4），
// 替代品是 `ctx.configForms`（@deepseek-ai/dsh-client-ui-settings 的 ConfigForms）：
//   ctx.configForms.get(entryId) -> ConfigForm { getSnapshot(), subscribe(cb), set(k,v), unset(k), mutate(fn) }
//
// 本模块是零依赖纯函数（故意用 .js 而非 .ts：tests/ 里可以用 node:test 直接 import，
// 不需要任何转译工具链）；index.tsx 以相对路径 `./settings-adapter.js` 导入，esbuild 会打进 bundle。
//
// 统一对外契约（调用方只用这三个方法）：
//   { getSnapshot(), subscribe(cb) -> unsubscribe, set(key, value) }
//
// 绝不返回 null/undefined：两侧服务都缺失时返回安全空实现（空快照 + no-op 订阅 + 静默 set），
// 因为调用方（萌宠 / 设置页 / 首启弹窗）会直接 `scope.set(...)`，返回 null 会当场崩 UI。

/** 设置命名空间 / config entryId（与 host 侧 index.js 注册的保持一致）。 */
const NS_FALLBACK = 'beast-tamer'

/** 两侧服务都缺失时的稳定空快照（必须是同一个对象引用：useSyncExternalStore 靠引用相等判断变化）。 */
const EMPTY_SNAPSHOT = {}

/** 探测键上/原型上的方法（不按版本号判断，只看能力）。 */
function methodOf(obj, name) {
  if (obj == null) return null
  try {
    const fn = obj[name]
    return typeof fn === 'function' ? fn : null
  } catch {
    return null
  }
}

/** 安全取服务：ctx.get 可能不存在、也可能抛错。 */
function svc(ctx, name) {
  if (ctx == null) return undefined
  const get = methodOf(ctx, 'get')
  if (get) {
    try {
      const found = get.call(ctx, name)
      if (found != null) return found
    } catch {}
  }
  try {
    return ctx[name]
  } catch {
    return undefined
  }
}

/**
 * 把一个「有 getSnapshot/subscribe 或 get/watch，以及 set/update」的对象归一成统一契约。
 * @returns {null | {getSnapshot:Function, subscribe:Function, set:Function}} null = 该形状不可用
 */
function normalizeScope(raw) {
  if (raw == null) return null
  const getSnapshotFn = methodOf(raw, 'getSnapshot') || methodOf(raw, 'get')
  const subscribeFn = methodOf(raw, 'subscribe') || methodOf(raw, 'watch')
  if (!getSnapshotFn && !subscribeFn) return null

  const setFn = methodOf(raw, 'set')
  const updateFn = methodOf(raw, 'update')

  return {
    getSnapshot() {
      if (!getSnapshotFn) return EMPTY_SNAPSHOT
      try {
        const snap = getSnapshotFn.call(raw)
        return snap == null ? EMPTY_SNAPSHOT : snap
      } catch {
        return EMPTY_SNAPSHOT
      }
    },
    subscribe(cb) {
      if (!subscribeFn) return () => {}
      try {
        const off = subscribeFn.call(raw, cb)
        return typeof off === 'function' ? off : () => {}
      } catch {
        return () => {}
      }
    },
    set(key, value) {
      try {
        if (setFn) {
          setFn.call(raw, key, value)
          return
        }
        // 0.1.x 的 settings scope 只暴露 update(patch) 时的兜底。
        if (updateFn) updateFn.call(raw, { [key]: value })
      } catch {
        // 静默：设置写失败绝不能让 UI 崩。
      }
    },
  }
}

/** 尝试把候选源解析成一个可用 scope；解析不出来返回 null。 */
function resolveFrom(ctx, ns) {
  // 1) DSH 0.1.x：ctx.settingsScope.bind({ namespace })
  const ss = svc(ctx, 'settingsScope')
  const bind = methodOf(ss, 'bind')
  if (bind) {
    try {
      const bound = normalizeScope(bind.call(ss, { namespace: ns }))
      if (bound) return bound
    } catch {}
  }

  // 2) DSH 0.2.x：ctx.configForms.get(entryId)
  const cf = svc(ctx, 'configForms')
  const cfGet = methodOf(cf, 'get')
  if (cfGet) {
    try {
      const form = normalizeScope(cfGet.call(cf, ns))
      if (form) return form
    } catch {}
  }

  // 3) settingsScope 本身就直接是 scope（没有 bind）时的兜底
  const direct = normalizeScope(ss)
  if (direct) return direct

  return null
}

/**
 * 创建统一设置契约。
 *
 * 惰性解析：每次调用都重新探测（某些 profile 下服务可能晚于 apply 挂载），
 * 因此即使 apply 时两边都还没有，服务到位后也能自动接管（写操作在被解析出来之前是静默的）。
 *
 * @param {any} ctx client 侧 ctx
 * @param {string} [namespace] 设置命名空间 / config entryId，默认 'beast-tamer'
 */
export function createSettingsScope(ctx, namespace) {
  const ns = namespace || NS_FALLBACK

  // 惰性解析 + 复用（避免每次渲染都 bind 出一个新对象）。
  let cached = null
  const resolve = () => {
    if (cached) return cached
    let found = null
    try {
      found = resolveFrom(ctx, ns)
    } catch {
      found = null
    }
    if (found) cached = found
    return cached
  }

  return {
    getSnapshot() {
      const real = resolve()
      return real ? real.getSnapshot() : EMPTY_SNAPSHOT
    },
    subscribe(cb) {
      const real = resolve()
      return real ? real.subscribe(cb) : () => {}
    },
    set(key, value) {
      const real = resolve()
      if (real) real.set(key, value)
    },
    /** 调试/诊断用：当前是否已接上真实设置源。 */
    get ready() {
      return resolve() != null
    },
  }
}

export default createSettingsScope
