// 元数据兼容闸门回归测试。
//
// 为什么需要它：DSH 升级后插件「装不上 / 加载不了」的根因往往不在业务代码，而在
// package.json 的声明里：
//   1) peerDependencies 里 @deepseek-ai/dsh-* 的区间没覆盖新运行版本 → 被兼容性预检拒载。
//      实测（真实 semver 7.8.5，口径与 DSH 侧 plugin-compatibility.ts 一致）：
//        · `^0.1.0-rc.7` 在 includePrerelease 下**挡得住** 0.2.0-rc.2 → 必须放宽；
//        · `>=0.1.0-rc.7 <0.3.0` 同时放行 0.1.7-rc.2 与 0.2.0-rc.2，且排除 0.3.0。
//   2) 客户端 inject 里留着已被下线的服务/包名 → 插件永远等不到依赖，永不激活
//      （`settingsScope` 在 0.2.0 已被 `configForms` 取代，`dsh-client-runtime` 已下线）。
//
// 判定必须用**真实 semver**，不要手写一份复刻品——本文件早先的版本就是手写比较器，
// 结果在 includePrerelease 语义上得出了与真实库相反的结论。
// 真实 semver 位于 DSH 运行时内部，用环境变量 DSH_SEMVER 指向其 index.js；
// 未提供或不可加载时**跳过**校验并明确打印 [skip]，绝不假装验证过。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const require = createRequire(import.meta.url)

/** 本插件声明支持、且必须实测覆盖的 DSH 运行版本。 */
const REQUIRED_DSH_RUNTIMES = ['0.1.7-rc.2', '0.2.0-rc.2']

/** DSH 侧判定口径：includePrerelease 恒为 true。 */
const SEMVER_OPTIONS = { includePrerelease: true }

/** 加载真实 semver；失败返回 undefined（调用方跳过而不是造假绿）。 */
function loadSemver() {
  const candidates = [
    process.env.DSH_SEMVER,
    'C:/Users/Administrator/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/semver/index.js',
  ].filter((item) => typeof item === 'string' && item !== '')
  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue
      return { semver: require(candidate), from: candidate }
    } catch {
      /* 试下一个 */
    }
  }
  return undefined
}

const loaded = loadSemver()

test('前置：真实 semver 必须可用，否则本文件的判定没有意义', () => {
  if (!loaded) {
    console.log('[skip] 未找到真实 semver（设置 DSH_SEMVER 指向 semver/index.js 可启用本组校验）')
    return
  }
  // 用两条已知事实给这个 semver 做「口径自检」，确认 includePrerelease 语义没被搞反
  assert.equal(loaded.semver.satisfies('0.2.0-rc.2', '^0.1.0-rc.7', SEMVER_OPTIONS), false)
  assert.equal(loaded.semver.satisfies('0.2.0-rc.2', '>=0.1.0-rc.7 <0.3.0', SEMVER_OPTIONS), true)
  console.log(`[semver] 使用 ${loaded.from}（v${loaded.semver.SEMVER_SPEC_VERSION ?? '?'}）`)
})

test('peerDependencies 必须同时满足存量 0.1.7 与目标 0.2.0（与 DSH 预检同口径）', () => {
  if (!loaded) return
  const peers = manifest.peerDependencies ?? {}
  const dshPeers = Object.entries(peers).filter(
    ([dep]) => dep === '@deepseek-ai/dsh' || dep.startsWith('@deepseek-ai/dsh-'),
  )
  assert.ok(dshPeers.length > 0, '至少要有 @deepseek-ai/dsh-* 的 peer 声明（这是唯一被强制的兼容闸门）')

  for (const runtime of REQUIRED_DSH_RUNTIMES) {
    for (const [dep, range] of dshPeers) {
      assert.equal(
        loaded.semver.satisfies(runtime, range, SEMVER_OPTIONS),
        true,
        `${dep} 的范围 "${range}" 不覆盖 DSH ${runtime} —— 该插件会在这条运行线上被拒载`,
      )
    }
  }
})

test('peer 区间不虚标：必须排除下一个破坏性线（0.3.0）', () => {
  if (!loaded) return
  for (const [dep, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!dep.startsWith('@deepseek-ai/dsh')) continue
    assert.equal(
      loaded.semver.satisfies('0.3.0', range, SEMVER_OPTIONS),
      false,
      `${dep} 的范围 "${range}" 乐观地覆盖了未验证的 0.3.0`,
    )
  }
})

test('engines.dsh 与自述 compatibility.dsh 必须与 peer 覆盖面一致', () => {
  if (!loaded) return
  const declared = manifest.engines?.dsh
  assert.equal(typeof declared, 'string')
  for (const runtime of REQUIRED_DSH_RUNTIMES) {
    assert.equal(
      loaded.semver.satisfies(runtime, declared, SEMVER_OPTIONS),
      true,
      `engines.dsh "${declared}" 不覆盖 ${runtime}`,
    )
  }
  const compat = manifest.dsh?.compatibility
  assert.ok(compat, 'dsh.compatibility 是给人读的兼容台账，不能少')
  assert.equal(compat.dsh, declared, 'compatibility.dsh 与 engines.dsh 应保持一致')
  for (const runtime of REQUIRED_DSH_RUNTIMES) {
    assert.equal(compat.dshReleases?.[runtime], 'compatible', `compatibility.dshReleases 缺 ${runtime} 的实测标注`)
  }
})

test('客户端 inject 只列真实存在的 DSH client 包（已被下线的包名会拖死插件加载）', () => {
  const inject = manifest.dsh?.client?.inject ?? []
  assert.ok(Array.isArray(inject))
  // 0.1.7 起已被移除的 client 包，绝不能出现在 inject 里
  for (const name of ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-schema-form']) {
    assert.equal(inject.includes(name), false, `${name} 已从 DSH 下线，留在 inject 里会让插件永不激活`)
  }
  // 0.2.0 起被 configForms 取代的服务名，同样不能声明
  assert.equal(inject.includes('settingsScope'), false, 'settingsScope 在 DSH 0.2.0 已被 configForms 取代')

  // 若能找到 DSH 源码检出，就逐名核实包确实存在（找不到时跳过，不假装验证过）
  const checkout = process.env.DSH_CHECKOUT ?? 'F:/MyApp/eternal/deepseek-harness'
  const clientRoot = join(checkout, 'packages', 'client')
  if (!existsSync(clientRoot)) {
    console.log(`[skip] 未发现 DSH 源码检出（${clientRoot}），跳过包名存在性核实`)
    return
  }
  const available = new Set()
  for (const dir of readdirSync(clientRoot)) {
    const pkgPath = join(clientRoot, dir, 'package.json')
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    if (typeof pkg.name === 'string') available.add(pkg.name)
  }
  for (const name of inject) {
    assert.equal(available.has(name), true, `dsh.client.inject 声明的 ${name} 在 DSH 检出里不存在`)
  }
})

test('发布白名单必须包含 host 兼容层（否则装的人拿不到适配代码）', () => {
  const files = manifest.files ?? []
  assert.equal(files.includes('lib/settings-host.js'), true, 'lib/settings-host.js 必须进 npm 包白名单')
  assert.equal(files.includes('index.js'), true)
  assert.equal(files.includes('lib/client.js'), true)
})

test('schemastery 依赖范围必须容得下 DSH 自带的 3.18.4（volatile 投影要求）', () => {
  if (!loaded) return
  // DSH 0.1.7 / 0.2.0 自己依赖 ~3.18.4；本插件依赖 ^3.18.1。
  // 两者范围必须重叠，否则会解析出两份 schemastery，volatile 活引用协议对不上。
  const range = manifest.dependencies?.['@deepseek-ai/schemastery']
  assert.equal(typeof range, 'string')
  assert.equal(loaded.semver.satisfies('3.18.4', range, SEMVER_OPTIONS), true, `schemastery "${range}" 容不下 DSH 自带的 3.18.4`)
  assert.equal(loaded.semver.satisfies('3.18.1', range, SEMVER_OPTIONS), true, `schemastery "${range}" 容不下 3.18.1`)
})
