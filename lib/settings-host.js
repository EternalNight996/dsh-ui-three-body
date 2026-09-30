// 设置兼容层（host 侧）：把 DSH 两代 settings 形状收敛成同一套内部接口。
//
// 为什么需要它（一手证据，DSH commit 601d6761e4「project volatile Config through
// profile-backed forms (#4587)」）：
//   · ≤0.1.5 形状：ctx.settings 是「命名空间注册表」。
//     ctx.settings.register(ns, Config, { base }) → 句柄 { get, watch, update, replace }。
//   · ≥0.1.7 形状：ctx.settings 是表单服务 SettingsForms（@deepseek-ai/dsh-settings），
//     只有 configure / describe / update，**没有 register**；插件配置改为 apply(ctx, config)
//     收到的「活引用」，变更由 loader 的 'loader/volatile-update' 事件广播。
//
// 策略：只用「形状嗅探」（typeof 判方法），绝不用版本号字符串做功能开关。
// 这样 DSH 以后再改动形状，只要还有一条路径可用就仍然能挂上。
//
// 对外契约（业务代码只依赖这三个）：
//   get()                    → 当前配置快照（普通对象，已解开 volatile 活引用）
//   watch(cb)                → 订阅变更，返回退订函数
//   update(patch)            → 合并写入（0.2 路径带 revision 冲突重试）

/** cosmokit 的活引用写入品牌；与 DSH 内部 packages/settings/settings/src/schema.ts 同源。 */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

/**
 * 判定一个值是否为 cosmokit「活引用」（volatile ref）。
 * @param {unknown} value 待判定值。
 * @returns {boolean} true 表示需要调 .get() 才能取到真实值。
 */
export function isVolatileRef(value) {
  return typeof value === 'object' && value !== null && VOLATILE_WRITE in value
}

/**
 * 递归解开 volatile 活引用，得到纯数据快照。
 * 关键：**每次读取都要重新解引用，不能缓存**——否则宿主热更新后读到的仍是旧快照。
 * @param {unknown} value 任意配置值（可能是活引用 / 数组 / 对象 / 原始值）。
 * @param {number} [depth] 递归保护深度。
 * @returns {unknown} 纯数据。
 */
export function plainConfig(value, depth = 0) {
  if (depth > 8) return value
  if (isVolatileRef(value)) return plainConfig(value.get(), depth + 1)
  if (Array.isArray(value)) return value.map((item) => plainConfig(item, depth + 1))
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = plainConfig(item, depth + 1)
    return out
  }
  return value
}

/**
 * 取本插件在 profile 里的 Loader 条目 id。
 * 0.2 的表单服务以「条目 id」为命名空间键，写配置必须用它（不是插件自报的 ns）。
 * @param {object} ctx cordis 上下文。
 * @param {string} fallback 探测不到时的兜底命名空间。
 * @returns {string} 条目 id。
 */
export function settingsEntryId(ctx, fallback) {
  const candidates = [
    ctx && ctx.fiber && ctx.fiber.entry && ctx.fiber.entry.options && ctx.fiber.entry.options.id,
    ctx && ctx.fiber && ctx.fiber.entry && ctx.fiber.entry.id,
    ctx && typeof Symbol.for === 'function' && ctx[Symbol.for('cordis.entry')]
      && ctx[Symbol.for('cordis.entry')].options && ctx[Symbol.for('cordis.entry')].options.id,
  ]
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim() !== '') return item
  }
  return fallback
}

/**
 * 给 schema 的每个字段打 meta.volatile 标记。
 * 必须用「构造后遍历 .dict」的方式，**不能用链式 .volatile()**——
 * schemastery 3.18.1 没有 .volatile 方法，链式调用会在 import 期抛错把整个插件打挂；
 * 而 ≥0.1.7 的设置页只投影 volatile 字段，不打标就会整页不显示。
 * @param {object} schema schemastery schema。
 * @returns {number} 实际打标的字段数。
 */
export function markAllVolatile(schema) {
  // 注意：schemastery 的 schema 是**函数**（可调用），不能用 typeof === 'object' 判空。
  if (!schema || (typeof schema !== 'object' && typeof schema !== 'function')) return 0
  const dict = schema.dict
  if (!dict || (typeof dict !== 'object' && typeof dict !== 'function')) return 0
  let marked = 0
  for (const field of Object.values(dict)) {
    if (!field || (typeof field !== 'object' && typeof field !== 'function')) continue
    field.meta = { ...(field.meta ?? {}), volatile: true }
    marked += 1
  }
  return marked
}

/**
 * 从 schema 字段上摘出默认值，作为「settings 服务缺失 / 活引用不可用」时的兜底快照。
 * 走 schema.dict 而不是 toJSON()——实测同一 schema 的 toJSON() 有时不返回 dict 节点，
 * 直接读 .dict 才是稳定入口。
 * @param {object} schema schemastery schema。
 * @returns {object} 字段默认值。
 */
function schemaDefaults(schema) {
  const out = {}
  try {
    const dict = schema && schema.dict
    if (!dict || (typeof dict !== 'object' && typeof dict !== 'function')) return out
    for (const [key, field] of Object.entries(dict)) {
      const meta = field && field.meta ? field.meta : {}
      if (meta.default !== undefined) out[key] = plainConfig(meta.default)
    }
  } catch {
    /* 畸形 schema 不该让插件挂掉 */
  }
  return out
}

/**
 * 绑定设置命名空间，屏蔽两代形状差异。
 * @param {object} ctx cordis 上下文（需要 ctx.effect / ctx.on / ctx.get）。
 * @param {object} schema schemastery schema（本函数会就地打 volatile 标记）。
 * @param {object} [config] apply() 收到的活引用配置（0.2 路径的关键输入）。
 * @param {object} [options] 可选参数。
 * @param {string} [options.namespace] 命名空间兜底值（默认 'beast-tamer'）。
 * @param {string} [options.label] 日志用的插件名。
 * @returns {{get: Function, watch: Function, update: Function, shape: string, entryId: string, volatileFields: number}}
 *   shape 取值：'registry'（≤0.1.5）/ 'forms'（≥0.1.7）/ 'defaults'（两者都没有，只读降级）。
 */
export function bindSettings(ctx, schema, config, options = {}) {
  const namespace = options.namespace ?? 'beast-tamer'
  const label = options.label ?? namespace
  const volatileFields = markAllVolatile(schema)
  const fallback = schemaDefaults(schema)

  const service = ctx && typeof ctx.get === 'function' ? ctx.get('settings') : ctx && ctx.settings

  // ── 路径 A：≤0.1.5 注册表形状 ────────────────────────────────────────────
  if (service && typeof service.register === 'function') {
    const handle = service.register(namespace, schema, { base: config ?? {} })
    return {
      shape: 'registry',
      entryId: namespace,
      volatileFields,
      get: () => {
        try {
          const value = typeof handle.get === 'function' ? handle.get() : undefined
          return plainConfig(value === undefined ? fallback : value)
        } catch {
          return { ...fallback }
        }
      },
      watch: (cb) => {
        try {
          if (handle && typeof handle.watch === 'function') {
            const off = handle.watch(() => {
              try {
                cb()
              } catch {
                /* 订阅回调异常不能影响宿主 */
              }
            })
            return typeof off === 'function' ? off : () => {}
          }
        } catch {
          /* 形状不符则退化为不订阅 */
        }
        return () => {}
      },
      update: async (patch) => {
        if (!handle || typeof handle.update !== 'function') return undefined
        return handle.update(patch)
      },
    }
  }

  // ── 路径 B：≥0.1.7 表单形状（活引用 + volatile-update 事件）──────────────
  const entryId = settingsEntryId(ctx, namespace)
  const read = () => {
    if (config === undefined || config === null) return { ...fallback }
    const plain = plainConfig(config)
    return plain && typeof plain === 'object' ? plain : { ...fallback }
  }

  if (service && typeof service.configure === 'function') {
    // 自带设置页：登记「不自动生成页面」，同一实例重复登记会抛错，必须只登记一次。
    try {
      ctx.effect(() => {
        try {
          return service.configure({ auto: false }, ctx.fiber)
        } catch {
          return () => {}
        }
      }, `${label}: settings presentation`)
    } catch {
      /* ctx.effect 不存在时忽略，不影响主功能 */
    }
  }

  return {
    shape: service && typeof service.configure === 'function' ? 'forms' : 'defaults',
    entryId,
    volatileFields,
    get: read,
    watch: (cb) => {
      const handler = () => {
        try {
          cb()
        } catch {
          /* 同上 */
        }
      }
      if (ctx && typeof ctx.on === 'function') {
        try {
          const off = ctx.on('loader/volatile-update', handler)
          return typeof off === 'function' ? off : () => {}
        } catch {
          return () => {}
        }
      }
      return () => {}
    },
    update: async (patch) => {
      if (!service || typeof service.update !== 'function') {
        throw new Error(`[${label}] 当前 DSH 版本不支持写配置（settings.update 缺失）`)
      }
      // 单实例 revision 冲突重试一次：先取最新 revision 再重试，而不是把冲突抛给用户。
      const call = (revision) => service.update(entryId, patch, revision)
      let expected
      try {
        const list = typeof service.describe === 'function' ? service.describe() : []
        const entry = Array.isArray(list) ? list.find((item) => item && item.ns === entryId) : undefined
        expected = entry ? entry.revision : undefined
      } catch {
        expected = undefined
      }
      try {
        return await call(expected)
      } catch (error) {
        const message = String((error && error.message) || error)
        if (!/revision|conflict|changed since/i.test(message)) throw error
        let fresh
        try {
          const list = typeof service.describe === 'function' ? service.describe() : []
          const entry = Array.isArray(list) ? list.find((item) => item && item.ns === entryId) : undefined
          fresh = entry ? entry.revision : undefined
        } catch {
          fresh = undefined
        }
        if (fresh === undefined) throw error
        return call(fresh)
      }
    },
  }
}
