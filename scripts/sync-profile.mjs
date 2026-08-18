// 把本地 dsh-ui-three-body 的开发产出同步到 dsh 的 web profile 副本。
//
// 背景：profile 通过 `file:` 依赖引用本项目，pnpm 安装的是拷贝而非符号链接，
// 改完源码若不重新安装，dsh 运行时加载的仍是旧副本 → 界面报错 / 无法进入。
// 本脚本把运行所需的文件（*不*包含构建产物之外的临时文件）拷到：
//   C:\Users\<user>\.dsh\profiles\web\node_modules\dsh-ui-three-body
//
// 用法：node scripts/sync-profile.mjs     （在 dsh-ui-three-body 根目录执行）
// 构建 client bundle 的流程不变：改 src 后先 `pnpm build`，再 `node scripts/sync-profile.mjs`。

import { cpSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// profile 副本路径：~/.dsh/profiles/web/node_modules/dsh-ui-three-body
const home = os.homedir()
const profile = join(home, '.dsh', 'profiles', 'web', 'node_modules', 'dsh-ui-three-body')

if (!existsSync(profile)) {
  console.error(`[beast-master] 未找到 profile 副本: ${profile}`)
  console.error('上次安装后 dsh profile 可能变动，先执行: cd "…/dsh-ui-three-body" && pnpm add "file:$(pwd)"')
  process.exit(1)
}

// 需要同步给运行时的文件（服务端 + 客户端均需；client 需 build 过才有 lib/client.js）。
const files = ['index.js', 'package.json', 'cordis.patch.yml', 'lib/kernel.js']
const dirs = ['lib']

for (const f of files) {
  const src = join(root, f)
  if (!existsSync(src)) continue
  cpSync(src, join(profile, f), { force: true })
  console.log(`[beast-master] synced ${f}`)
}
for (const d of dirs) {
  const srcDir = join(root, d)
  if (!existsSync(srcDir)) continue
  cpSync(srcDir, join(profile, d), { recursive: true, force: true })
  console.log(`[beast-master] synced ${d}/`)
}

// 校验：确认副本确实是刚同步的（读版本号 /tame 是否已转义）。
const srcKernel = readFileSync(join(root, 'lib', 'kernel.js'), 'utf8')
const dstKernel = readFileSync(join(profile, 'lib', 'kernel.js'), 'utf8')
if (srcKernel === dstKernel) {
  console.log('[beast-master] 校验通过：profile 副本与源码一致 ✅')
} else {
  console.error('[beast-master] ⚠️ 校验失败：副本与源码不一致（拷贝可能被占用）')
  process.exit(1)
}
