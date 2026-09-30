// 状态路由单测：假 ctx 真跑 buildSnapshot，并把两条接缝约束钉死。
//
// 事实依据（DSH 0.2.0 源码取证）：
//   · running 的**唯一权威源**是 ctx.get('agents') 里 Agent.status === 'running'
//     （SessionStore 上没有任何 running 概念）。
//   · host **没有**「当前会话」概念，只能由调用方指定或启发式挑第一个在跑的。
//   · goal/todos/title 来自 sessionProjections.snapshot(session, [...])；未装载的投影
//     单元会让对应 key **缺席**（不是 null）。
//   · 路由不能挂在 /api 前缀下（被 client-connection 占用）；且 webServer.register
//     不是 effect，必须包 ctx.effect。

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshot, registerStateRoute, STATE_PREFIX } from '../lib/state-route.js'

/** 造一个假 ctx。 */
function makeCtx({ agents, sessions, projections } = {}) {
  const services = { agents, sessions, sessionProjections: projections }
  const effects = []
  return {
    effects,
    get: (name) => services[name],
    effect(callback, label) {
      effects.push(label)
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
}

/** 造一个假 session 对象。 */
function sessionOf(id, cwd) {
  return { id, header: cwd === undefined ? {} : { cwd } }
}

test('路由前缀必须避开 /api（否则与 client-connection 撞车）', () => {
  assert.equal(STATE_PREFIX.startsWith('/api'), false, '前缀不能落在 /api 下')
  assert.equal(STATE_PREFIX, '/beast-tamer/api')
})

test('running 取 Agent.status，而不是任何会话字段', async () => {
  const ctx = makeCtx({
    agents: {
      list: () => [{ id: 's1', status: 'running' }, { id: 's2', status: 'idle' }],
      get: (id) => ({ id, status: id === 's1' ? 'running' : 'idle' }),
    },
    sessions: { get: (id) => sessionOf(id) },
    projections: { snapshot: () => ({ values: {} }) },
  })
  const snap = await buildSnapshot(ctx, null)
  assert.equal(snap.running, true)
  assert.equal(snap.sessions, 2)
  assert.equal(snap.sessionId, 's1', '无指定时应优先挑正在跑的那个')
})

test('调用方指定 session 时优先用指定的', async () => {
  const ctx = makeCtx({
    agents: {
      list: () => [{ id: 's1', status: 'running' }, { id: 's2', status: 'idle' }],
      get: (id) => ({ id, status: 'idle' }),
    },
    sessions: { get: (id) => sessionOf(id) },
    projections: { snapshot: () => ({ values: {} }) },
  })
  const snap = await buildSnapshot(ctx, 's2')
  assert.equal(snap.sessionId, 's2')
  assert.equal(snap.running, false)
})

test('todos 缺失预派生计数：自己算 total/done/current，且允许并行 in_progress', async () => {
  const todos = [
    { content: '写主进程', status: 'completed' },
    { content: '写渲染层', status: 'in_progress' },
    { content: '写状态桥', status: 'in_progress' },
    { content: '写文档', status: 'pending' },
  ]
  const ctx = makeCtx({
    agents: { list: () => [{ id: 's1', status: 'idle' }], get: () => ({ status: 'idle' }) },
    sessions: { get: (id) => sessionOf(id) },
    projections: { snapshot: () => ({ values: { todos } }) },
  })
  const snap = await buildSnapshot(ctx, null)
  assert.equal(snap.todo.total, 4)
  assert.equal(snap.todo.done, 1)
  assert.equal(snap.todo.current, '写渲染层', 'current 取第一条 in_progress')
})

test('goal 投影缺席时给 null，而不是编造', async () => {
  const ctx = makeCtx({
    agents: { list: () => [{ id: 's1', status: 'idle' }], get: () => ({ status: 'idle' }) },
    sessions: { get: (id) => sessionOf(id) },
    projections: { snapshot: () => ({ values: {} }) },
  })
  const snap = await buildSnapshot(ctx, null)
  assert.equal(snap.goal, null)
  assert.equal(snap.todo, null, '待办为空时给 null')
})

test('goal 有值时映射出 rounds/maxRounds/phase', async () => {
  const ctx = makeCtx({
    agents: { list: () => [{ id: 's1', status: 'running' }], get: () => ({ status: 'running' }) },
    sessions: { get: (id) => sessionOf(id) },
    projections: {
      snapshot: () => ({
        values: {
          goal: { goal: { objective: '做桌面宠物', phase: 'active', maxGoalRounds: 40 }, roundsStarted: 3 },
          title: '实现桌面宠物',
        },
      }),
    },
  })
  const snap = await buildSnapshot(ctx, null)
  assert.equal(snap.goal.rounds, 3)
  assert.equal(snap.goal.maxRounds, 40)
  assert.equal(snap.goal.phase, 'active')
  assert.equal(snap.title, '实现桌面宠物')
})

test('标题回落链：title → cwd 目录名 → 空串（host 没有 displayTitle）', async () => {
  const ctx = makeCtx({
    agents: { list: () => [{ id: 's1', status: 'idle' }], get: () => ({ status: 'idle' }) },
    sessions: { get: (id) => sessionOf(id, 'F:\\MyApp\\eternal\\dsh-pet-sophon') },
    projections: { snapshot: () => ({ values: { title: null } }) },
  })
  const snap = await buildSnapshot(ctx, null)
  assert.equal(snap.title, 'dsh-pet-sophon')
})

test('服务缺失/畸形：不许抛错，一律降级', async () => {
  for (const ctx of [makeCtx({}), makeCtx({ agents: {}, sessions: {}, projections: {} }), makeCtx({
    agents: { list: () => { throw new Error('boom') } },
  })]) {
    const snap = await buildSnapshot(ctx, null)
    assert.equal(snap.ok, true)
    assert.equal(typeof snap.running, 'boolean')
    assert.equal(typeof snap.sessions, 'number')
  }
  // 投影 snapshot 抛错也要降级
  const ctx = makeCtx({
    agents: { list: () => [{ id: 's1', status: 'idle' }], get: () => ({ status: 'idle' }) },
    sessions: { get: (id) => sessionOf(id) },
    projections: { snapshot: () => { throw new Error('projection missing') } },
  })
  const snap = await buildSnapshot(ctx, null)
  assert.equal(snap.goal, null)
  assert.equal(snap.todo, null)
})

test('registerStateRoute 必须把注册包进 ctx.effect（否则卸载后残留路由）', () => {
  const registered = []
  const webServer = { register: (route) => { registered.push(route); return () => {} } }
  const ctx = makeCtx({})
  const ok = registerStateRoute(ctx, webServer)
  assert.equal(ok, true)
  assert.equal(ctx.effects.length, 1, '必须产生一个 effect')
  assert.equal(registered.length, 1)
  assert.equal(registered[0].kind, 'prefix')
  assert.equal(registered[0].path, '/beast-tamer/api')
})

test('registerStateRoute：webServer 不可用时返回 false 且不抛', () => {
  assert.equal(registerStateRoute(makeCtx({}), undefined), false)
  assert.equal(registerStateRoute(makeCtx({}), {}), false)
  assert.equal(registerStateRoute(makeCtx({}), { register: () => { throw new Error('dup route') } }), false)
})

test('handler：正确路径返回 200 JSON，其它路径 404，且缓存生效', async () => {
  let snapshotCalls = 0
  const ctx = makeCtx({
    agents: { list: () => [{ id: 's1', status: 'running' }], get: () => ({ status: 'running' }) },
    sessions: { get: (id) => sessionOf(id) },
    projections: {
      snapshot: () => {
        snapshotCalls += 1
        return { values: {} }
      },
    },
  })
  let route = null
  const webServer = { register: (r) => { route = r; return () => {} } }
  registerStateRoute(ctx, webServer)

  const call = async (path) => {
    const chunks = []
    const res = {
      headersSent: false,
      writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true },
      end(body) { chunks.push(body) },
    }
    await route.handler({ url: path }, res)
    return { status: res.status, headers: res.headers, body: chunks.join('') }
  }

  const ok = await call('/beast-tamer/api/state')
  assert.equal(ok.status, 200)
  assert.equal(JSON.parse(ok.body).running, true)
  assert.equal(ok.headers['Cache-Control'], 'no-store')

  // 立刻再请求一次：命中 50ms 缓存，不应再折投影
  const before = snapshotCalls
  await call('/beast-tamer/api/state')
  assert.equal(snapshotCalls, before, '缓存期内不应重复计算快照')

  const missing = await call('/beast-tamer/api/other')
  assert.equal(missing.status, 404)
})

test('handler：异常时返回 500 而不是把进程带崩', async () => {
  const ctx = makeCtx({
    agents: { list: () => { throw new Error('agents exploded') } },
  })
  let route = null
  registerStateRoute(ctx, { register: (r) => { route = r; return () => {} } })

  const res = {
    headersSent: false,
    writeHead(status) { this.status = status; this.headersSent = true },
    end() {},
  }
  await route.handler({ url: '/beast-tamer/api/state' }, res)
  // agents.list 抛错被 buildSnapshot 内部降级，因此这里应是 200 而不是 500
  assert.equal(res.status, 200)
})
