# 发布到插件市场（npm + GitHub）指南

参考 [dsh-ui-agents-pixe](https://github.com/EternalNight996/dsh-ui-agents-pixe) 的发布范式与 [dsh-market](https://github.com/dsh-market/dsh-market) 的收录机制整理。本插件已按该范式配置好，按下面顺序走即可。

---

## 0. 先看懂：插件是怎么被「发现」的

DSH 插件市场（`dshmarket`）不是人工审核制，而是**自动同步**两类来源：

1. **npm 包**：`keywords` 里带 `dsh-plugin` 的包（市场优先用 npm tarball 安装，快）。
2. **GitHub 仓库**：打了 `dsh-plugin` topic 的仓库（提供 README、截图、star 数、五维评分素材）。

所以「上传到插件市场」= ① 推 GitHub 并打 `dsh-plugin` topic + ② 发 npm。两条都做，收录与安装体验最好。

---

## 1. 配置核对（与 pixe 范式一致）

本插件 `package.json` 已具备市场收录所需的关键字段，发布前只需把 `<你的用户名>` 占位符换成真实值：

```jsonc
{
  "name": "dsh-ui-three-body",              // npm 包名，全小写、无 @scope 时需唯一
  "main": "index.js",                      // host 半边入口
  "exports": {
    ".": "./index.js",
    "./client": "./lib/client.js",         // client 半边（dsh.client 靠它自动挂载）
    "./cordis.patch.yml": "./cordis.patch.yml",  // bundle 补丁层
    "./package.json": "./package.json"
  },
  "files": ["index.js", "lib", "assets", "cordis.patch.yml", "README.md", "LICENSE"], // npm tarball 白名单
  "keywords": ["dsh-plugin", "deepseek-harness", "dsh", "..."],  // ⭐ 关键：dsh-plugin 让市场收录
  "repository": { "url": "git+https://github.com/<你的用户名>/dsh-ui-three-body.git" },
  "homepage": "https://github.com/<你的用户名>/dsh-ui-three-body",
  "scripts": { "prepublishOnly": "node build.mjs" },   // 发布前自动重构建 client
  "dsh": {
    "client": { "platform": "web", "inject": [...] },   // client 自动挂载元数据
    "bundle": { "patch": "./cordis.patch.yml" }          // host 行自动挂载
  }
}
```

对比 pixe 的三点差异（本插件已对齐）：

| 项 | pixe | 本插件 | 说明 |
| --- | --- | --- | --- |
| host 入口 | `lib/index.js` | `index.js` | 无所谓，`main` 指向哪都行 |
| `peerDependencies` | `dsh-llm`/`dsh-tools` | `cordis`/`schemastery` | 只声明你实际 import 的 |
| client 注入 | `inject: []` | 显式列了 runtime | 显式列更稳，两者都合法 |

---

## 2. 本地先验证（发布前必做）

```bash
# 1. 装依赖 + 构建 client
pnpm i
pnpm build                 # 生成 lib/client.js

# 2. 装进当前 profile 试跑
dsh plugin --profile web add F:/absolute/path/to/dsh-ui-three-body
# 或：npx @deepseek-ai/dsh plugin --profile web add dsh-ui-three-body（已发布后）

# 3. 重启 dsh web 看效果：设置 → 插件 → 驯兽场；左上角萌宠
```

确认无误再发布。

---

## 3. 上传 GitHub

```bash
cd dsh-ui-three-body
git init
git add .
git commit -m "feat: 驯兽师（驯兽场）DSH 插件 v0.1.0"

# 在 GitHub 网页上先建空仓库 dsh-ui-three-body，然后：
git remote add origin https://github.com/<你的用户名>/dsh-ui-three-body.git
git branch -M main
git push -u origin main
```

**关键一步**：在 GitHub 仓库页 → ⚙️ Settings → Topics，添加 `dsh-plugin`（再加 `deepseek-harness`、`prompt-engineering` 等）。这是市场自动收录 GitHub 源的识别标志。

> README 里的截图/录屏放 `assets/` 并在 README 引用（市场会自动从 README 提取截图，也可在 registry 侧人工策展）。

---

## 4. 上传 npm

```bash
npm login          # 首次：输入 npm 账号（去 npmjs.com 注册）
npm publish        # 触发 prepublishOnly 自动 build，然后发布
```

发布成功后：

- npm 地址：`https://www.npmjs.com/package/dsh-ui-three-body`
- 用户可一条命令安装：`dsh plugin --profile web add dsh-ui-three-body`

常见坑：

- **包名被占**：`npm publish` 报 `403 Forbidden` 通常是名字冲突，改个名字（如 `dsh-beast-tamer`）。
- **未构建就发布**：`prepublishOnly` 已兜底重构建 client，别删这行。
- **`.npmignore`**：本项目用 `files` 白名单，比 `.npmignore` 更省心，别两个都写。

---

## 5. 进入插件市场（收录）

发布 npm + 打 GitHub topic 后，市场 registry（`dshmarket` 快照源 `awesome-dsh-plugin.com/plugins.json`）会周期性同步。若想主动加速/确认收录：

1. 到 [dsh-market](https://github.com/2BingLing/dsh-market) 或 [dsh-plugin-marketplace](https://github.com/AwesomeHou/dsh-plugin-marketplace) 的收录入口提交（README/issue 里有提交方式）。
2. 五维评分靠 README 质量：**用途一句话 + 真实截图 + 安装命令 + 目录结构 + 待办**（本插件 README 已按此结构写好）。
3. 打分维度（实用五维）：功能性 / 稳定性 / 文档 / 体验 / 维护。截图与清晰的「怎么用」直接拉高分。

---

## 6. 更新版本

```bash
npm version patch        # 0.1.0 → 0.1.1（自动改 package.json + git tag）
npm publish              # 重新发布
git push --follow-tags   # 同步 tag 到 GitHub
```

市场会对每个插件做「npm 版本 vs HEAD」的更新检查，用户可一键更新。

---

## 一句话总览

```
本地验证 → GitHub 建仓打 dsh-plugin topic → npm login + npm publish → 市场自动收录
```
