// 客户端设置适配层 —— 真实 ConfigForm 形状的回归测试。
//
// 为什么单独一个文件：早先的 settings-adapter.test.mjs 用的夹具是**简化形状**
// （getSnapshot 直接返回设置值对象），与 DSH 真实的 `ConfigForm` 不一致，
// 于是漏掉了一个致命 bug：
//
//   DSH 的 `ConfigForm.getSnapshot()` 返回的是**包装快照**
//   `{ status, value, base, user, revision, writable, mode }`，
//   设置值在 `.value` 里。把包装当值用，`value.onboarded` 永远读不到，
//   而判断式 `value.onboarded !== false` 恒为真
//   → 首启「开始驯兽」弹窗永不收起，表现为「点了没反应」。
//
// 本文件用**与源码逐字对齐**的包装快照夹具，把这条钉死；
// 并覆盖服务晚到（挂起订阅必须补挂且补通知一次）。

import test from 'node:test'
import assert from 'node:assert/strict'
import { createSettingsScope, unwrapSnapshot, isFormSnapshot } from '../src/client/settings-adapter.js'

/**
 * 造一个与 DSH `ConfigForm` 同形的假实现。
 * @param {object} initial 初始设置值。
 * @param {'loading'|'ready'|'unavailable'} [status] 初始同步状态。
 */
function fakeConfigForm(initial, status = 'ready') {
  let value = { ...initial }
  let current = status
  let revision = 3
  const listeners = new Set()
  const writes = []
  const form = {
    getSnapshot: () => ({
      status: current,
      value: current === 'ready' ? { ...value } : undefined,
      base: {},
      user: {},
      revision,
      writable: true,
      mode: 'host',
    }),
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    set(field, next) {
      writes.push([field, next])
      value[field] = next
      revision += 1
      for (const cb of listeners) cb()
      return Promise.resolve(true)
    },
    unset() {
      return Promise.resolve(true)
    },
  }
  return {
    form,
    writes,
    listeners,
    setStatus(next) {
      current = next
      for (const cb of listeners) cb()
    },
    raw: () => value,
  }
}

/** 用假 ConfigForm 造 ctx。 */
function ctxWithForm(form, { delayMs = 0 } = {}) {
  let served = delayMs === 0
  const api = { get: (id) => (id === 'beast-tamer' ? form : undefined) }
  const ctx = {
    get(name) {
      if (name !== 'configForms') return undefined
      return served ? api : undefined
    },
    /** 测试用：让服务「晚到」。 */
    _serve() {
      served = true
    },
    _api: api,
  }
  return ctx
}

// ── unwrapSnapshot 本体 ────────────────────────────────────────────────────

test('isFormSnapshot：只认带 status/value/writable 的包装快照', () => {
  assert.equal(isFormSnapshot({ status: 'ready', value: {}, writable: true }), true)
  assert.equal(isFormSnapshot({ enabled: true }), false)
  assert.equal(isFormSnapshot(null), false)
  assert.equal(isFormSnapshot({ status: 'ready' }), false, '缺 value/writable 不算')
})

test('unwrapSnapshot：ready 时取出 .value，这是最关键的一步', () => {
  const out = unwrapSnapshot({ status: 'ready', value: { onboarded: false, petSize: 64 }, writable: true })
  assert.deepEqual(out, { onboarded: false, petSize: 64 })
})

test('unwrapSnapshot：loading / unavailable 回落到「值未知」(null)，不能当成空对象', () => {
  assert.equal(unwrapSnapshot({ status: 'loading', value: undefined, writable: true }), null)
  assert.equal(unwrapSnapshot({ status: 'unavailable', value: undefined, writable: false }), null)
})

test('unwrapSnapshot：非包装对象原样返回；null/标量给 null', () => {
  assert.deepEqual(unwrapSnapshot({ onboarded: true }), { onboarded: true })
  assert.equal(unwrapSnapshot(null), null)
  assert.equal(unwrapSnapshot(42), null)
})

// ── 回归：首启弹窗的判断式必须能拿到真实值 ──────────────────────────────────

test('回归：configForms 包装快照下，getSnapshot() 必须返回纯设置值（首启弹窗靠它判断）', () => {
  const { form } = fakeConfigForm({ onboarded: false, enabled: true, petSize: 64 })
  const scope = createSettingsScope(ctxWithForm(form), 'beast-tamer')
  const snapshot = scope.getSnapshot()

  // 关键断言：拿到的是设置值本身，不是 {status,value,...} 包装
  assert.equal(snapshot.status, undefined, 'getSnapshot() 不能把包装快照漏出去')
  assert.equal(snapshot.onboarded, false, 'onboarded 必须可读——否则 `!== false` 恒真、弹窗永不收起')
  assert.equal(snapshot.petSize, 64)

  // 复现原 bug 的判断式：修好后必须为 false（即弹窗应显示）
  const shouldShowModal = !snapshot || snapshot.onboarded !== false
  assert.equal(shouldShowModal, false, '首启弹窗判断式必须为 false（显示弹窗），而不是恒真')
})

test('回归：status=loading 时视为「值未知」，调用方按默认值渲染（弹窗能看到）', () => {
  const { form } = fakeConfigForm({ onboarded: false }, 'loading')
  const scope = createSettingsScope(ctxWithForm(form), 'beast-tamer')
  const snapshot = scope.getSnapshot()
  assert.equal(snapshot.status, undefined, '不能漏包装')
  assert.equal(snapshot.onboarded, undefined, 'loading 时值未知')
  // 未知时判断式仍为 true（显示弹窗）——这是期望行为：首帧未到也应先欢迎
  assert.equal(!snapshot || snapshot.onboarded !== false, true)
})

test('回归：点击「开始驯兽」的写入必须真的落到 ConfigForm.set', () => {
  const { form, writes } = fakeConfigForm({ onboarded: false })
  const scope = createSettingsScope(ctxWithForm(form), 'beast-tamer')
  scope.set('onboarded', true)
  assert.deepEqual(writes, [['onboarded', true]], '必须透传到 ConfigForm.set')
})

test('set 返回的 rejected Promise 不能被漏成 unhandled rejection', async () => {
  const form = {
    getSnapshot: () => ({ status: 'ready', value: {}, writable: true }),
    subscribe: () => () => {},
    set: () => Promise.reject(new Error('host refused')),
  }
  const scope = createSettingsScope(ctxWithForm(form), 'beast-tamer')
  // 不应抛同步异常，也不应产生未处理的 rejection
  assert.doesNotThrow(() => scope.set('enabled', false))
  await new Promise((resolve) => setTimeout(resolve, 10))
})

// ── 服务晚到：挂起订阅必须补挂并补通知一次 ─────────────────────────────────

test('回归：服务晚到时先挂起订阅，就绪后补挂并通知一次', async () => {
  const { form, listeners } = fakeConfigForm({ onboarded: false })
  const ctx = ctxWithForm(form, { delayMs: 1 })

  const scope = createSettingsScope(ctx, 'beast-tamer')
  let notified = 0
  const off = scope.subscribe(() => {
    notified += 1
  })

  // 服务尚未就绪：还没订上真实源
  assert.equal(listeners.size, 0, '服务未就绪时不应假装订上')

  ctx._serve() // 服务到位
  const first = scope.getSnapshot() // 任意一次读取触发解析
  assert.equal(first.onboarded, false)
  assert.equal(listeners.size, 1, '解析成功后必须把挂起的订阅补挂到真实源')
  assert.ok(notified >= 1, '服务到位要补通知一次，否则 UI 停在默认渲染')

  const before = notified
  for (const cb of listeners) cb()
  assert.ok(notified > before, '补挂之后的变更应能正常通知')

  off()
  // 退订可能发生在「解析之前」：此时要保证解析后不会再补挂这个回调
  assert.equal(listeners.size, 0, '退订必须真的摘掉（含解析前退订的情况）')

  // 反向验证：解析前就退订的回调，服务到位后也不能被补挂（用一套全新的 ctx）
  const { form: form2, listeners: listeners2 } = fakeConfigForm({ enabled: true })
  const ctx2 = ctxWithForm(form2, { delayMs: 1 })
  const scope2 = createSettingsScope(ctx2, 'beast-tamer')
  const off2 = scope2.subscribe(() => {})
  off2()
  ctx2._serve()
  assert.equal(scope2.ready, true, '解析本身应成功')
  assert.equal(listeners2.size, 0, '解析前退订的回调不得被补挂')
})

test('回归：服务晚到时若一直不就绪，getSnapshot 给稳定空对象且 set 静默', () => {
  const scope = createSettingsScope({ get: () => undefined }, 'beast-tamer')
  const a = scope.getSnapshot()
  const b = scope.getSnapshot()
  assert.equal(a, b, '空快照必须是同一引用，否则 useSyncExternalStore 会死循环')
  assert.deepEqual(a, {})
  assert.doesNotThrow(() => scope.set('enabled', true))
  assert.equal(scope.ready, false)
})

// ── 旧形状仍然要兼容 ───────────────────────────────────────────────────────

test('settingsScope 旧形状（直接返回值对象的 scope）仍能工作', () => {
  const state = { onboarded: false, petSize: 48 }
  const listeners = new Set()
  const writes = []
  const bound = {
    getSnapshot: () => ({ ...state }),
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    set(key, value) {
      writes.push([key, value])
      state[key] = value
      for (const cb of listeners) cb()
    },
  }
  const ctx = { get: (name) => (name === 'settingsScope' ? { bind: () => bound } : undefined) }
  const scope = createSettingsScope(ctx, 'beast-tamer')

  assert.equal(scope.getSnapshot().onboarded, false)
  assert.equal(scope.getSnapshot().status, undefined, '旧形状也不该漏出 status')
  scope.set('onboarded', true)
  assert.deepEqual(writes, [['onboarded', true]])
})

test('rawSnapshot 暴露原始包装（需要 revision 的调用方用）', () => {
  const { form } = fakeConfigForm({ enabled: true })
  const scope = createSettingsScope(ctxWithForm(form), 'beast-tamer')
  const raw = scope.rawSnapshot()
  assert.equal(raw.status, 'ready')
  assert.equal(typeof raw.revision, 'number')
  assert.equal(raw.writable, true)
})
