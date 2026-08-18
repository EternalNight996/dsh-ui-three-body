# 驯兽师（驯兽场）· dsh-beast-master

> 把「人话」翻译给智能体的 DSH 插件。开启后，每一次对话都注入「驯兽师内核」——第一性原理 + 需求剖析 + 极简沟通 + 最少 token，让智能体真正「开智」、更懂人类；左上角悬浮一只萌宠做开关，设置面板里可配置内核档位。

---

## 一句话原理

智能体不是听不懂人，是不知道你「真正要什么」。驯兽师在每次请求的 system prompt 里插入一段内核，把模糊的人类需求强制翻译成「可剖析 → 可对齐 → 可审核 → 可执行 → 可监督」的精确任务，用最少的 token 做最高效的事。

## 安装

```bash
# 从 GitHub 安装（发布后）
dsh plugin add github:<你的用户名>/dsh-beast-master

# 本地联调
cd <profile 目录>
pnpm add /absolute/path/to/dsh-beast-master
```

安装后：`dsh 设置 → 插件 → 驯兽场` 即可配置；左上角出现萌宠即已开启。

## 内核（开智内容）

内核是核心资产，全部在 [`lib/kernel.js`](lib/kernel.js)，三档：

| 档位 | 说明 | 适用 |
| --- | --- | --- |
| `minimal` | 极简：铁律 + 一句流程 | 最省 token 的场景 |
| `balanced` | 默认：铁律 + 四步「驯兽流程」 | 通用 |
| `full` | balanced + 「做官网」完整示例 | 需要示例引导的模型 |

内核遵循的四步「驯兽流程」（就是你说的那个）：

1. **剖析需求** — 纯软件 / 软硬结合？分段？前端 / 后端 / 管理端？审美？成功标准？
2. **定目标** — 收敛成一句话可验证目标，让 agent 不走弯路。
3. **出计划** — 整理成极简 markdown 交人审核，**OK 才继续，NG 则修正重提**，绝不越过审核直接执行。
4. **执行并监督** — 交给 agent 执行，全程监督到完成。

三条铁律：**第一性原理**（拆到最小再重组）、**极简沟通**（最少的话交付最高效结果）、**最少 token**（拒绝冗余复述）。

## 架构

```
dsh-beast-master/
├── index.js            # host 插件：内核注入 + settings 命名空间（无构建，即装即用）
├── lib/
│   └── kernel.js       # 驯兽师内核文案（三档）
├── src/
│   └── client/index.tsx # client 插件源码：悬浮萌宠 + 设置页
├── lib/client.js       # 构建产物（由 build.mjs 生成，git 可提交）
├── build.mjs           # esbuild 构建脚本（TSX → __ModuleLoader__ 格式）
├── cordis.patch.yml    # bundle 补丁层（只挂 host 行；client 由 dsh.client 元数据自动挂载）
├── package.json        # bundle/client 清单（dsh.bundle.patch + dsh.client）
├── assets/pet.svg      # 萌宠占位立绘
└── README.md
```

- **host 侧**（`index.js`）：`inject: ['systemPrompt', 'settings']`
  - `ctx.settings.register('beast-tamer', Config, { base: config })` 注册持久化设置；
  - 监听设置变化，`ctx.systemPrompt.section({ name: 'beast-tamer:kernel', order: 5, text })` 注入/移除内核。
- **client 侧**（`src/client/index.tsx`）：`inject: ['settingsScope', 'slots']`
  - `shell.overlay` → 悬浮萌宠（可拖拽、点击开关内核）；
  - `settings.plugins.tab` → 「驯兽场」设置标签页；
  - 通过 `ctx.settingsScope.bind({ namespace: 'beast-tamer' })` 读写设置。

「联动当前使用的 AI 模型」是**自动**的：内核只是组装进 system prompt 的一个分段，无论会话切到哪个模型都生效。

## 构建（只改 client 时需要）

```bash
pnpm i          # 安装 esbuild / @types/react
pnpm build      # 生成 lib/client.js
```

只改 `lib/kernel.js`（内核文案）或 `index.js`（host 逻辑）**不需要构建**，重启 dsh 即生效。

## 设置项

> **首次使用会弹「驯兽师 · 首次唤醒」引导**，让用户先定下语气/自称/称呼等规矩，之后可随时回「设置 → 插件 → 驯兽场」改。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 驯兽场总开关（内核注入） |
| `mode` | `balanced` | 内核档位：minimal / balanced / full |
| `lang` | `zh` | 内核语言：zh / en |
| `tone` | `arrogant` | 语气：arrogant 傲慢 / gentle 温和 / warm 热忱 |
| `selfName` | `本尊` | 驯兽师自称（可自由填写） |
| `userTitle` | `主上` | 驯兽师对你的称呼（可自由填写） |
| `petEnabled` | `true` | 悬浮萌宠是否显示 |
| `analyzeTool` | `false` | beast_analyze 需求剖析工具（默认关，省 token） |
| `kernelOverride` | `''` | 自定义内核文本（优先级高于以上所有） |
| `onboarded` | `false` | 是否已完成首次引导（内部字段） |

---

## ✅ 我已补充的（框架自带）

1. **完整双面插件骨架**：host + client 全部分离，符合 DSH bundle 契约（`dsh.bundle.patch` + `dsh.client` + `exports["./client"]`）。
2. **内核文案**：三档 + 四步流程 + 三条铁律 + 官网示例，直接可用、可改。
3. **持久化设置**：走官方 `settings` 服务（存进 settings 文件），不是 localStorage。
4. **悬浮萌宠交互**：拖拽、点击开关、休眠/唤醒视觉态、不遮挡操作区（`shell.overlay` 帧级浮层）。
5. **设置页**：`settings.plugins.tab`「驯兽场」，含总开关、萌宠开关、档位选择、内核覆盖文本框。
6. **构建脚本**：`build.mjs` 一键把 TSX 打成 DSH 客户端加载格式。

## 🧩 需要你补充的（待办清单）

按优先级排列：

1. **萌宠立绘** ⭐ 只剩这一步：已用**程序化内联 SVG**（呼吸/眨眼/尾巴/眼睛跟随鼠标，零依赖）替代 Lottie，三态情绪（休眠/待命/工作）自动切换。想更好看，用 Figma/即时设计画个 SVG 萌宠替换 `BeastMascot` 里的矢量即可，动画逻辑不动（见 [`docs/MASCOT.md`](docs/MASCOT.md)）。
2. ~~萌宠位置 & 持久化~~ ✅ 已做：默认右侧中间、长按拖拽、`petPos` 持久化到 settings 文件。
3. **发布元数据**：`package.json` 的 repository/homepage 已填 `EternalNight996`；按 [`PUBLISH.md`](PUBLISH.md) 走 git push + npm publish。
4. ~~品牌人设~~ ✅ 已做：内核「驯兽师」人设，且语气/自称/称呼**首次使用时弹窗可选可填**（不再写死）。
5. ~~多语言~~ ✅ 已做：内核中英双语 + 设置页/萌宠走 `locale` 服务中英切换。
6. ~~需求剖析工具~~ ✅ 已做：`beast_analyze`（默认关，设置页可开），设计见 [`docs/ANALYZE.md`](docs/ANALYZE.md)。
7. **训练数据/反馈闭环**：长线方案见 [`docs/TRAINING.md`](docs/TRAINING.md)（捕获反馈 → 沉淀偏好 → 召回注入，Phase 1 可先行）。

## 注意事项

- **不要复杂化**：当前版本刻意最小化，只有内核 + 开关 + 萌宠；新增功能先问「是否值得多花的 token / 代码」。
- **token 纪律是内核的一部分**：改内核文案时，每多一个字都是每轮对话的固定成本，务必精炼。

## License

MIT
