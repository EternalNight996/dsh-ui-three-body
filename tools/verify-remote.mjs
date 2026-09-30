// 校验远端 GitHub 上真正落地的内容（不依赖本地 git 元数据）。
// 用法：node tools/verify-remote.mjs

import https from 'node:https'

const REPO = 'EternalNight996/dsh-ui-three-body'
const BRANCH = 'main'

/** 拉一个远端文件。 */
function fetchRaw(path) {
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': 'three-body-verify' } }, (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode, body }))
      })
      .on('error', reject)
  })
}

/** 对某个远端文件做若干「必须包含」断言。 */
const FILES = [
  {
    path: 'src/client/settings-adapter.js',
    must: [
      ['unwrapSnapshot 已导出', 'export function unwrapSnapshot'],
      ['loading/unavailable 视为值未知', "raw.status !== 'ready'"],
      ['挂起订阅已实现', 'pending.push(cb)'],
      ['set 的 rejected Promise 已兜住', 'result.catch(() => {})'],
      ['退订走 callback→disposer 映射', 'attached.get(cb)'],
    ],
  },
  {
    path: 'lib/settings-host.js',
    must: [
      ['两代形状嗅探', "typeof service.register === 'function'"],
      ['volatile 打标不用链式 .volatile()', 'field.meta = { ...(field.meta ?? {}), volatile: true }'],
      ['revision 冲突重试', 'conflict'],
    ],
  },
  {
    path: 'lib/state-route.js',
    must: [
      ['路由避开 /api 前缀', "'/beast-tamer/api'"],
      ['注册包进 ctx.effect', 'ctx.effect('],
      ['running 取 Agent.status', "agent?.status === 'running'"],
    ],
  },
  {
    path: 'lib/client.js',
    must: [
      // 压缩产物里函数名被剪短，只能按「压缩后的真实特征」断言。
      // 出现 .value 解包 + writable 探测，就说明 isFormSnapshot/unwrapSnapshot 已内联进包；
      // 旧的坏版本是 `getSnapshot(){ ... return a??X }`（原样返回包装，无这两样）。
      ['客户端产物含包装快照解包', '.value'],
      ['客户端产物含 writable 探测', 'writable'],
    ],
  },
  {
    path: 'package.json',
    must: [
      ['版本已是 0.3.0-rc.2 或更新', '0.3.0-rc'],
      ['peer 区间已放宽到 0.3.0', '>=0.1.0-rc.7 <0.3.0'],
      ['发布白名单含状态路由', 'lib/state-route.js'],
    ],
  },
  {
    path: 'tests/settings-adapter-form.test.mjs',
    must: [
      ['包装快照回归测试已入库', '包装快照'],
    ],
  },
]

let failed = 0
for (const file of FILES) {
  let result
  try {
    result = await fetchRaw(file.path)
  } catch (error) {
    console.log(`FAIL ${file.path} 拉取失败: ${error.message}`)
    failed += 1
    continue
  }
  if (result.status !== 200) {
    console.log(`FAIL ${file.path} HTTP ${result.status}`)
    failed += 1
    continue
  }
  const misses = file.must.filter(([, needle]) => !result.body.includes(needle))
  if (misses.length === 0) {
    console.log(`OK   ${file.path}（${result.body.length} 字节，${file.must.length} 项断言全过）`)
  } else {
    failed += 1
    console.log(`FAIL ${file.path}`)
    for (const [label] of misses) console.log(`      缺: ${label}`)
  }
}

console.log('')
console.log(failed === 0 ? '远端校验通过：GitHub 上的内容确实含全部修复' : `远端校验失败：${failed} 个文件不合格`)
process.exit(failed === 0 ? 0 : 1)
