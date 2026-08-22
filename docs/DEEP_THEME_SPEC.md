# dsh-ui-deep-theme · 主题皮肤插件开发目标文本

> **给 dsh-theme AI 的任务说明**：按本文完整实现一个独立的「DeepSeek Harness 主题皮肤插件」，可更换 GUI 背景 + 静态图片皮肤 + 动态视频皮肤（环绕跟随帧），并在设置页与侧边栏提供主题切换。**不要改动 dsh 源码**，做成标准 DSH 客户端插件。

---

## 📦 安装（若插件完成后想试用）

```bash
# 安装主题插件（完成后）
npx @deepseek-ai/dsh plugin --profile web add github:EternalNight996/dsh-ui-deep-theme

# 推荐先装 dsh-desktop（桌面壳，主题插件体验最佳）
#   GitHub：https://github.com/EternalNight996/dsh-desktop
```

`dsh-desktop`（[https://github.com/EternalNight996/dsh-desktop](https://github.com/EternalNight996/dsh-desktop)）是 DeepSeek Harness 的桌面壳，主题/背景插件在桌面版上视觉效果与性能最好。

---

## 一、项目概述

- **项目名**：`dsh-ui-deep-theme`（DeepSeek Harness 主题皮肤插件）
- **类型**：DSH 客户端插件（`dsh.client` + `shell.overlay`），含宿主半边 `settings` 命名空间
- **目标**：让用户给 DSH Web GUI 换背景/主题，支持 3 种皮肤形态：内置主题 / 静态图片 / 动态视频
- **安装**：`npx @deepseek-ai/dsh plugin --profile web add <路径>`，装后侧边栏底部「🎨 主题」按钮 + 设置 → **主题** 分区可切换

## 二、核心需求（三大点）

### 1. 自由换背景 + 设置主题
- 在设置页新增顶层分区 **「主题」**（`settings.section`，id: `deep-theme`，order: 25）
- 分区内提供：主题选择列表（内置主题）+ 导入按钮（图片/视频）+ 预览 + 启用
- 背景渲染在**根层**（页面最底层，`position: fixed; inset: 0; z-index: 0; pointer-events: none`），**不遮挡任何交互**
- 当前主题持久化到 `settings` 命名空间（`deep-theme`），重启保留

### 2. 静态图片皮肤（可导入）
- 内置默认图片皮肤（2-3 张预设）
- 支持用户**导入本地图片**（png/jpg/webp，`<input type=file>` → `URL.createObjectURL` 或复制进插件 `assets/` 目录）
- 图片默认 `object-fit: cover` 铺满；可选 `contain`（设置项）
- 图片皮肤下，界面文字/控件**自动保证可读**（加全局遮罩层或明暗主题适配）

### 3. 动态视频皮肤（可导入 + 环绕跟随帧）
- 内置默认视频：**`assets/videos/main-compressed.mp4`**（压缩版 1080p 环绕素材）
- 支持用户导入视频（`<video>` 元素）
- **核心交互「环绕跟随帧」**（照搬 meng-you Character360）：
  - 公式：`const wrap01 = v => v - Math.floor(v)`
  - `const angle = 鼠标X相对窗口比例 [0,1]`；`const t = wrap01((angle + 3*Math.PI/4) / (2*Math.PI))`
  - 在 `requestAnimationFrame` 里对 `t` 做**最短路径 lerp**（wrap 到 [-0.5, 0.5]，跨 ±π 边界不跳变），然后 `video.currentTime = t * video.duration`
  - 如果 `t` 与目标时差足够大才真正 `seek`（减少连续 seek 开销）
  - 视频层 `absolute; inset: 0; pointer-events: none`
  - `mousemove` 监听在 `window`，视频层不可点时交互依旧生效
  - `prefers-reduced-motion` 下不驱动，停在初始朝向

## 三、技术参考

### 架构参考：dsh-deep-whale（github.com/Small-tailqwq/dsh-deep-whale）
- 皮肤管理器 + 独立皮肤包 + `cordis.patch` 换肤（互斥启用）
- 本插件即「skin-manager」角色：**内置主题选择器 + 导入面板 + 设置分区**
- 主题切换用**主题 token / CSS 变量覆盖**（Query `Theme.listTokens`），背景层独立 DOM

### 视频跟随参考：meng-you Character360.tsx（`F:\MyApp\eternal\meng-you\web\src\components\Character360.tsx`）
- 默认 `src="/videos/main-compressed.mp4"`
- 核心为上面「环绕跟随帧」逻辑，**直接照搬**

## 四、架构与目录（建议）

```
dsh-ui-deep-theme/
├── index.js                  # host 半边：settings 命名空间 + 主题写读
├── lib/
│   ├── client.js             # client bundle（构建产物）
│   └── themes.js             # 内置主题定义（token/背景色/预设图）
├── src/
│   └── client/index.tsx      # client 源码：背景层 + 设置分区 + 侧边栏按钮 + 导入
├── assets/
│   ├── backgrounds/          # 内置默认图片（2-3 张）
│   └── videos/
│       └── main-compressed.mp4  # 默认视频（拷贝自 meng-you）
├── cordis.patch.yml          # bundle 补丁层
├── package.json              # dsh.client + dsh.bundle.patch
└── README.md
```

## 五、设置入口位置（参考 dsh-memory-eternal）

严格参考 `EternalNight996/dsh-memory-eternal` 的设置入口设计：

1. **侧边栏底部 footer 按钮**（`sidebar.footer.action`）：
   - 在 sidebar 底部（设置按钮旁）加一个「🎨 主题」按钮
   - 用 `sidebar.footer.action` 槽位，`id: 'deep-theme:footer'`，`order: 100`
   - 按钮样式（照搬 dsh-memory-eternal）：`display:flex; align-items:center; gap:9px; width:100%; padding:7px 10px; background:transparent; border:none; color:var(--dsw-alias-label-secondary); font:inherit; font-size:13.5px; border-radius:8px; cursor:pointer`；hover 用 `background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary)`
   - 侧栏 rail（窄条）态：只显示图标、隐藏 label（`.rail .label { display:none }`）
   - **点击 footer 按钮 → 打开「主题面板」弹窗**（快速切换主题 + 导入图片/视频），而非只跳设置分区

2. **设置 → 主题 顶层分区**（`settings.section`）：`id: 'deep-theme'`, `order: 25`, `label: '主题'`

3. **所有自定义 UI 用 `var(--dsw-alias-*)` 主题变量**（背景 `--dsw-alias-bg-*`、文字 `--dsw-alias-label-*`、边框 `--dsw-alias-border-*`），明暗模式原生适配，绝不硬编码色值

## 六、插件市场收录标准（发布前必须满足）

参考 `dsh-ui-three-body` 的发布配置，`package.json` 与仓库必须达标：

- **npm keywords**：必含 `dsh-plugin`（+ `deepseek-harness`、`dsh`、`theme`、`skin`、`background`）
- **GitHub topic**：仓库打 `dsh-plugin`（+ `deepseek-harness`、`dsh`）
- **package.json 元数据**：`repository`（GitHub 地址）、`homepage`、`author`、`license`（MIT）、`publishConfig.registry`（npmjs.org）
- **`files` 白名单**：`index.js`、`lib`、`assets`、`cordis.patch.yml`、`README.md`、`LICENSE`
- **`dsh` 元数据**：`client.platform: web` + `client.inject`（运行时）+ `bundle.patch: ./cordis.patch.yml`（host 自动挂载）

## 七、README + Git + npm 配置齐全

### README.md（中文，五维评分素材齐全）
必须含：**用途一句话**（开头）+ **真实截图**（内置 `assets/*.png` / demo.gif，2 张）+ **安装命令** + **目录结构** + **待办清单**。建议章节：
```
# 标题：dsh-ui-deep-theme 主题皮肤
> 一句话用途
## 效果预览（截图）
## 安装
## 功能（内置主题 / 图片 / 视频环绕跟随）
## 目录结构
## 待办 / 路线图
## License
```

### Git
- 本地 `git init` + 初始 commit（`feat: 初始主题皮肤插件`）
- 配双 remote：`origin`(GitHub) + `gitee`(Gitee)
- 分支 `main`，`git push -u origin main` + `git push -u gitee main`

### npm
- `package.json` 版本 `0.1.0`
- `scripts.prepublishOnly: "node build.mjs"`（发布前自动构建 client）
- `files` 白名单含 `lib/client.js` 构建产物
- `npm publish`（需 npm login；用 `--registry=https://registry.npmjs.org/`）

## 八、验收标准

1. 侧边栏底部出现「🎨 主题」按钮（rail 态仅图标）——参考 dsh-memory-eternal
2. 设置 → **主题** 分区出现，可切换「内置主题 / 图片 / 视频」三种形态
3. 图片皮肤：导入图片 → 背景铺满、不挡交互、文字可读
4. 视频皮肤：导入视频 → 背景播放，**鼠标左右滑动 = 环绕旋转帧**（currentTime 跟随、平滑无跳变）
5. `prefers-reduced-motion`：视频不驱动，停在初始帧
6. 切换主题平滑过渡（淡入，不硬切）
7. 持久化：重启后主题保留
8. 不挡任何 UI 交互；明暗模式适配
9. 导出成品附：**一条安装命令**（`npx @deepseek-ai/dsh plugin …`）+ **2 张效果截图**（明/暗各一）+ **`npm publish` 包名**（`dsh-ui-deep-theme@0.1.0`）

## 九、注意事项/边界

- **性能**：视频 `seek` 频繁易卡——用 rAF + lerp + 仅大幅变化才 seek；建议压缩版视频（1080p 已压）
- **互斥**：同一时间只启用一套皮肤（内置/图片/视频三态互斥）
- **存储**：导入的图片/视频优先**复制进插件 `assets/` 目录**（本地路径 + 拷进包，重启不丢）；内置默认即拷贝好的 `main-compressed.mp4`
- **权限**：背景层 `pointer-events: none` 必须，绝不拦截点击
- **不改 dsh 源码**：通过标准 slot（`settings.section`、`sidebar.footer.action`、`shell.overlay`）+ settings 命名空间实现

---
> 使用/安装推荐：[dsh-desktop](https://github.com/EternalNight996/dsh-desktop)（DeepSeek Harness 桌面壳）+ `npx @deepseek-ai/dsh plugin` 安装。
