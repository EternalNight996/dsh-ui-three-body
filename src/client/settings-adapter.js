// 设置作用域适配层（client 侧）——把 DSH 的 ConfigForm 形状归一成统一契约。
//
// 统一对外契约（调用方只用这三个）：
//   { getSnapshot() -> 纯设置值对象, subscribe(cb) -> 退订, set(key, value) }
//
// 关键事实（读 DSH 源码 + 实测踩坑得出，别改回去）：
//   1) DSH ≥0.1.7 的客户端设置服务是 `ctx.configForms`（`ConfigForm`），
//      **`settingsScope` 服务已不存在**（0.1.7-rc.2 与 0.2.0-rc.1 都没有）。
//   2) `ConfigForm.getSnapshot()` 返回的是**包装快照**：
//      `{ status, value, base, user, revision, writable, mode }`，
//      真正的设置值在 `.value` 里。把包装当成值用，`value.onboarded` 永远读不到，
//      而判断式 `value.onboarded !== false` 恒为真——首启弹窗因此永不收起、按钮「点了没反应」。
//   3) `status` 可能是 'loading'（首帧未到）或 'unavailable'（该命名空间未暴露），
//      这两种都必须回落到「值未知」，由调用方按自己的默认值渲染，不能当成空对象。
//   4) 服务可能晚于 apply 就绪：`subscribe` 未就绪时不能直接返回 no-op，
//      否则首帧订上空实现、服务到位后永远收不到通知。这里用「挂起订阅」补齐。
//
// 绝不抛错、绝不返回 null —— 调用方（萌宠/设置页/首启弹窗）会直接 `scope.set(...)`。

/** 设置命名空间 / config entryId（与 host 侧注册的保持一致）。 */
const NS_FALLBACK = 'beast-tamer'

/** 服务缺失/值未知时的稳定空快照（必须是同一引用：useSyncExternalStore 靠引用相等判断变化）。 */
const EMPTY_SNAPSHOT = Object.freeze({})

/** 探测对象上的方法（不按版本号判断，只看能力）。 */
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
function serviceOf(ctx, name) {
  if (ctx == null) return undefined
  const get = methodOf(ctx, 'get')
  if (get) {
    try {
      const found = get.call(ctx, name)
      if (found != null) return found
    } catch {
      /* 落到属性直读 */
    }
  }
  try {
    return ctx[name]
  } catch {
    return undefined
  }
}

/** 是否为 DSH 的 ConfigForm 包装快照。 */
export function isFormSnapshot(value) {
  if (value == null || typeof value !== 'object') return false
  return typeof value.status === 'string' && 'value' in value && 'writable' in value
}

/**
 * 从「可能是包装快照」的对象里取出纯设置值。
 * @param {unknown} raw getSnapshot() 的原始返回。
 * @returns {object|null} 纯设置值；null 表示「值未知」（loading/unavailable/形状不认识）。
 */
export function unwrapSnapshot(raw) {
  if (raw == null) return null
  if (isFormSnapshot(raw)) {
    // loading / unavailable 时 value 为 undefined：这是「未知」而不是「空对象」
    if (raw.status !== 'ready') return null
    const value = raw.value
    return value && typeof value === 'object' ? value : null
  }
  // zustand 式 / 旧 settingsScope：直接就是值对象
  if (typeof raw === 'object') return raw
  return null
}

/**
 * 把任意设置源归一成统一契约。
 * @param {object} raw DSH 的 ConfigForm 或旧式 scope。
 * @returns {{rawSnapshot:Function, getSnapshot:Function, subscribe:Function, set:Function}}
 */
export function normalizeScope(raw) {
  const getSnapshotFn = methodOf(raw, 'getSnapshot') || methodOf(raw, 'get')
  const subscribeFn = methodOf(raw, 'subscribe') || methodOf(raw, 'watch')
  const setFn = methodOf(raw, 'set')
  const updateFn = methodOf(raw, 'update')

  const readRaw = () => {
    if (!getSnapshotFn) return undefined
    try {
      return getSnapshotFn.call(raw)
    } catch {
      return undefined
    }
  }

  return {
    /** 原始包装快照（含 status/revision/writable），供需要 revision 的调用方使用。 */
    rawSnapshot: readRaw,
    getSnapshot() {
      const value = unwrapSnapshot(readRaw())
      return value ?? EMPTY_SNAPSHOT
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
          // 0.2 的 set 返回 Promise<boolean>（接受/拒绝）；不 await，拒绝也不能崩 UI
          const result = setFn.call(raw, key, value)
          if (result && typeof result.catch === 'function') result.catch(() => {})
          return
        }
        if (updateFn) updateFn.call(raw, { [key]: value })
      } catch {
        /* 设置写失败绝不能让 UI 崩 */
      }
    },
  }
}

/** 尝试解析出一个可用的设置源。 */
function resolveFrom(ctx, ns) {
  // DSH ≥0.1.7：ctx.configForms.get(entryId) —— 当前唯一真实存在的路径
  const forms = serviceOf(ctx, 'configForms')
  const get = methodOf(forms, 'get')
  if (get) {
    try {
      const form = get.call(forms, ns)
      if (form != null) return normalizeScope(form)
    } catch {
      /* 未暴露的命名空间会抛/返回空，落到下面的兜底 */
    }
  }
  // 历史形状（更早的 DSH）：ctx.settingsScope.bind({ namespace })
  const scope = serviceOf(ctx, 'settingsScope')
  const bind = methodOf(scope, 'bind')
  if (bind) {
    try {
      const bound = bind.call(scope, { namespace: ns })
      if (bound != null) return normalizeScope(bound)
    } catch {
      /* 忽略 */
    }
  }
  const direct = normalizeScope(scope)
  if (direct.rawSnapshot() !== undefined) return direct
  return null
}

/**
 * 创建统一设置契约。服务晚到时可自动接管（挂起订阅会在解析成功后补挂并通知一次）。
 * @param {any} ctx client 侧 ctx。
 * @param {string} [namespace] 设置命名空间 / config entryId，默认 'beast-tamer'。
 */
export function createSettingsScope(ctx, namespace) {
  const ns = namespace || NS_FALLBACK

  let cached = null
  /** 未就绪时挂起的回调。 */
  let pending = []
  /** 已挂到真实源上的回调 → 其退订函数。 */
  const attached = new Map()

  /**
   * 确保已解析出真实源；未就绪时返回 null。
   * 所有对外方法都要先调它——否则「订阅发生在解析之前、之后又没人读」时，
   * 补挂链会断掉（订上了空实现，服务到位后永远收不到通知）。
   */
  const ensure = () => {
    if (cached) return cached
    let found = null
    try {
      found = resolveFrom(ctx, ns)
    } catch {
      found = null
    }
    if (!found) return null
    cached = found
    const toAttach = pending
    pending = []
    for (const cb of toAttach) {
      try {
        const off = found.subscribe(cb)
        attached.set(cb, typeof off === 'function' ? off : () => {})
      } catch {
        /* 单个订阅失败不影响其它 */
      }
    }
    // 服务到位这一事实本身要通知一次，否则 UI 会停在「值未知」的默认渲染
    for (const cb of toAttach) {
      try {
        cb()
      } catch {
        /* 忽略 */
      }
    }
    return cached
  }

  /** 退订：兼容「解析前退订」与「解析后退订」两种情况。 */
  const detach = (cb) => {
    pending = pending.filter((item) => item !== cb)
    const off = attached.get(cb)
    if (off === undefined) return
    attached.delete(cb)
    try {
      off()
    } catch {
      /* 忽略 */
    }
  }

  return {
    getSnapshot() {
      const real = ensure()
      return real ? real.getSnapshot() : EMPTY_SNAPSHOT
    },
    subscribe(cb) {
      const real = ensure()
      if (real) {
        try {
          const off = real.subscribe(cb)
          attached.set(cb, typeof off === 'function' ? off : () => {})
        } catch {
          /* 订阅失败也不能抛给调用方 */
        }
        return () => detach(cb)
      }
      // 服务还没到：先挂着，解析成功后自动补挂
      pending.push(cb)
      return () => detach(cb)
    },
    set(key, value) {
      const real = ensure()
      if (real) real.set(key, value)
    },
    /** 调试用：是否已接上真实设置源。 */
    get ready() {
      return ensure() != null
    },
    /** 调试用：原始包装快照（含 status/revision/writable）。 */
    rawSnapshot() {
      const real = ensure()
      return real ? real.rawSnapshot() : undefined
    },
    /** 释放全部订阅（测试/热重载用）。 */
    dispose() {
      for (const off of attached.values()) {
        try {
          off()
        } catch {
          /* 忽略 */
        }
      }
      attached.clear()
      pending = []
      cached = null
    },
  }
}

export default createSettingsScope
