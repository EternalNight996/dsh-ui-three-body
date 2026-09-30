// 设置适配层单测：三种 ctx 形状（configForms / settingsScope / 两者都缺）。
//
// 直接 import 源码 .js（不需要转译）；断言只看对外契约行为，不依赖真实 DSH。
//
// 运行：node --test tests/settings-adapter.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'

import { createSettingsScope } from '../src/client/settings-adapter.js'

/** 0.2.x 形状：ctx.configForms.get(entryId) -> ConfigForm */
function ctxConfigForms(initial) {
  const state = { ...initial }
  const listeners = new Set()
  let setCalls = 0
  const form = {
    entryId: 'beast-tamer',
    getSnapshot: () => state,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    set(key, value) {
      setCalls += 1
      state[key] = value
      for (const cb of listeners) cb()
    },
    unset() {},
  }
  const requested = []
  const ctx = {
    get(name) {
      return name === 'configForms' ? { get: (id) => { requested.push(id); return form } } : undefined
    },
  }
  return { ctx, state, form, requested, listeners, setCalls: () => setCalls }
}

/** 0.1.x 形状：ctx.settingsScope.bind({namespace}) -> zustand 式 scope */
function ctxSettingsScope(initial) {
  const state = { ...initial }
  const listeners = new Set()
  let setCalls = 0
  const bound = {
    getSnapshot: () => state,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    set(key, value) {
      setCalls += 1
      state[key] = value
      for (const cb of listeners) cb()
    },
  }
  const binds = []
  const ctx = {
    get(name) {
      if (name === 'connection') return {}
      if (name === 'remote') return {}
      if (name === 'settingsScope') {
        return { bind: (opts) => { binds.push(opts); return bound } }
      }
      return undefined
    },
  }
  return { ctx, state, bound, binds, listeners, setCalls: () => setCalls }
}

test('configForms 形状（DSH 0.2）：快照/订阅/写入都接上，entryId 用命名空间', () => {
  const { ctx, state, requested, listeners } = ctxConfigForms({ enabled: true, petSize: 64 })
  const scope = createSettingsScope(ctx, 'beast-tamer')

  assert.equal(typeof scope.getSnapshot, 'function')
  assert.deepEqual(scope.getSnapshot(), { enabled: true, petSize: 64 })
  assert.deepEqual(requested, ['beast-tamer'], 'configForms.get 必须用 beast-tamer')
  assert.equal(scope.ready, true)

  let notified = 0
  const off = scope.subscribe(() => { notified += 1 })
  assert.equal(listeners.size, 1, 'subscribe 必须转发到底层 ConfigForm')
  scope.set('petSize', 96)
  assert.equal(state.petSize, 96)
  assert.equal(notified, 1, '写入后底层通知必须到达调用方')
  off()
  assert.equal(listeners.size, 0, '退订必须生效')
})

test('settingsScope 形状（DSH 0.1）：bind({namespace}) 且写入走 set', () => {
  const { ctx, state, binds, listeners } = ctxSettingsScope({ enabled: true, lang: 'zh' })
  const scope = createSettingsScope(ctx, 'beast-tamer')

  // 惰性解析：构造时不 bind，首次访问才 bind（且只 bind 一次）
  assert.deepEqual(scope.getSnapshot(), { enabled: true, lang: 'zh' })
  assert.deepEqual(binds, [{ namespace: 'beast-tamer' }])
  scope.getSnapshot()
  assert.equal(binds.length, 1, 'bind 结果必须被复用，不能每次渲染都新建')

  let notified = 0
  const off = scope.subscribe(() => { notified += 1 })
  assert.equal(listeners.size, 1)
  scope.set('lang', 'en')
  assert.equal(state.lang, 'en')
  assert.equal(notified, 1)
  off()
  assert.equal(listeners.size, 0)
})

test('settingsScope 只有 get/watch/update 的老形状也能兜住', () => {
  const state = { mode: 'balanced' }
  const listeners = new Set()
  const bound = {
    get: () => state,
    watch: (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    update: (patch) => { Object.assign(state, patch); for (const cb of listeners) cb() },
  }
  const ctx = { get: (n) => (n === 'settingsScope' ? { bind: () => bound } : undefined) }
  const scope = createSettingsScope(ctx, 'beast-tamer')

  assert.deepEqual(scope.getSnapshot(), { mode: 'balanced' })
  let notified = 0
  scope.subscribe(() => { notified += 1 })
  assert.equal(listeners.size, 1, 'watch 必须被归一成 subscribe')
  scope.set('mode', 'fast')
  assert.equal(state.mode, 'fast')
  assert.equal(notified, 1)
})

test('两侧服务都缺：不抛错、快照是稳定空对象、set 静默', () => {
  const ctx = { get: () => undefined }
  const scope = createSettingsScope(ctx, 'beast-tamer')

  assert.notEqual(scope, null)
  assert.notEqual(scope, undefined)
  assert.deepEqual(scope.getSnapshot(), {})
  assert.equal(scope.getSnapshot(), scope.getSnapshot(), '空快照必须引用稳定，否则 useSyncExternalStore 会死循环')

  const off = scope.subscribe(() => {})
  assert.equal(typeof off, 'function')
  assert.doesNotThrow(() => off())

  // 调用方大量直接 set：绝不能抛
  assert.doesNotThrow(() => scope.set('tone', 'arrogant'))
  assert.doesNotThrow(() => scope.set('enabled', false))
  assert.equal(scope.ready, false)
})

test('ctx 是 undefined / 服务抛错 / bind 返回垃圾：都退化为安全空实现', () => {
  assert.doesNotThrow(() => createSettingsScope(undefined, 'beast-tamer'))
  assert.deepEqual(createSettingsScope(undefined, 'beast-tamer').getSnapshot(), {})

  const throwing = {
    get(name) {
      if (name === 'settingsScope') return { bind: () => { throw new Error('boom') } }
      if (name === 'configForms') return { get: () => { throw new Error('boom') } }
      return undefined
    },
  }
  const scope = createSettingsScope(throwing, 'beast-tamer')
  assert.deepEqual(scope.getSnapshot(), {})
  assert.doesNotThrow(() => scope.set('a', 1))

  const garbage = { get: (n) => (n === 'configForms' ? { get: () => 42 } : { bind: () => 'nope' }) }
  const scope2 = createSettingsScope(garbage, 'beast-tamer')
  assert.deepEqual(scope2.getSnapshot(), {})
  assert.doesNotThrow(() => scope2.set('a', 1))
})

test('服务晚到：先空实现，服务就绪后惰性接管', () => {
  let cf = undefined
  const ctx = { get: (n) => (n === 'configForms' ? cf : undefined) }
  const scope = createSettingsScope(ctx, 'beast-tamer')

  assert.equal(scope.ready, false)
  assert.deepEqual(scope.getSnapshot(), {})

  const state = { enabled: true }
  cf = { get: () => ({ getSnapshot: () => state, subscribe: () => () => {}, set: (k, v) => { state[k] = v } }) }
  assert.equal(scope.ready, true)
  assert.deepEqual(scope.getSnapshot(), { enabled: true })
  scope.set('enabled', false)
  assert.equal(state.enabled, false)
})
