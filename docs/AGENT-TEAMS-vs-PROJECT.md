# DSH 官方「智能体团队」vs 本项目：能力对比

> 证据口径：**DSH 0.2.0-rc.1 源码逐文件取证**（`packages/experimental/agent-team`、
> `tool-agent-team`、`client-ui-agent-team`、`agent-team-profile`、`packages/subagent`、
> `docs/subsystems/agent-team.md`、`docs/tool-catalog.md`、`docs/config-catalog.md`）。
> 本仓库的结论全部落到「文件:行号」或原文引文，**不做无证据推测**。

---

## 0. 先厘清「本项目」的定位

本仓库 `dsh-ui-three-body`（三体智子）是一个 **DSH 宿主侧 + 客户端插件**：
注入「产品设计 copilot」内核（system prompt 分段）、提供悬浮宠物与设置页、可选注册
`beast_analyze` 工具。**它不是多智能体编排框架**，与官方 Agent Teams 不构成同层竞品。

真正的同层对比对象是本组织内的另两个多智能体项目：

| 项目 | 形态 | 与官方 Agent Teams 的关系 |
|---|---|---|
| `memory-eternal`（记忆核心） | DSH 插件，单智能体记忆层 | 互补：给任意会话提供持久记忆 |
| `dsh-memory-eternal` / `agent-teams-pixel` | 多智能体 / 角色团队呈现 | **同层竞品**，需按下表逐项对比 |

因此下表的「本项目」列，按**你可替换的两种角色**分别标注：
- **智子（dsh-ui-three-body）**：编排层之外的「内核/体验层」，与 Agent Teams 组合而非竞争。
- **自研多智能体方案**：与官方 Agent Teams 直接竞争。

---

## 1. 总览对比表

| 维度 | DSH 官方 Agent Teams | 智子（dsh-ui-three-body） | 自研多智能体方案（memory-eternal 一线） |
|---|---|---|---|
| 定位 | 单会话内的「多智能体委托 + 共享任务板」运行时 | 单 Agent 的**行为内核 + 体验层**（诱导正确工作法） | 多智能体 + 记忆沉淀 |
| 交付形态 | 1 个实验性 bundle（domain + tools + UI 三包），默认关 | 1 个插件（host 声明 + client bundle） | 插件 + 独立 web 端 |
| 是否改 DSH 源码 | 否（走 bundle patch 层） | 否（cordis.patch.yml + client 模块） | 否 |
| 稳定性承诺 | **无**（三个包均为 experimental prototype，契约/schema 可自由变） | 声明双线兼容（0.1.5-alpha.2 → 0.2.0-rc.2） | 需按项目实际声明 |
| 启用成本 | 插件页开关 / `dsh plugin add` | 一条 `dsh plugin add` | 一条 `dsh plugin add` |
| 常驻 token 开销 | **固定** policy 段 + 9 个工具 schema，**每个成员每次请求都付** | 内核按档位注入（minimal/balanced/full），**AI 模式关闭即每轮零 token** | 取决于是否常驻召回段 |
| 成本护栏 | **无轮次 / token / 预算上限**；只有 maxMembers 8、maxTasks 256、每目标 64 条待投、单条 64KB | 有 token 总闸（AI 模式） | 视实现 |
| 生效时机 | **仅当用户显式要求**时才组队（no autonomous team creation） | 每轮自动注入（可关） | 视实现 |

---

## 2. Agent Teams 的真实能力（优势）

| # | 能力 | 具体事实（带证据） |
|---|---|---|
| 1 | **持久化消息，崩溃不丢** | 全部状态写在 Lead Session 日志里，4 类 log-only 事件（`team/member` / `team/task` / `team/message/queued` / `team/message/delivered`，version 2），`appendAndFlush` 后成功。恢复 = projection 重放 + provisioning 对账 + `queued-minus-delivered` 重投 |
| 2 | **投递语义定义得比多数同类产品严谨** | 只有目标 Session **持久持有 messageId** 才记 `delivered`；返回 `accepted`/`queued`，并明令**禁止重发**；文档主动声明「非跨进程 exactly-once」 |
| 3 | **共享任务板是真 CAS** | `expectedRevision` 不等即 `TEAM_TASK_STALE_REVISION`；revision 每次 +1 且重放侧校验**连续性**；读-判-写包在串行事务里，并发只有一个赢家 |
| 4 | **任务依赖是真 DAG 校验** | 禁自环 / 重复 / 引用已删除任务 / **有环**（DFS 三色）；blocker 全 completed 才 ready；readiness **不会**自动唤醒 owner（诚实声明） |
| 5 | **状态语义诚实** | `inactive` 明确定义为「无轮次在执行」，**不代表任务完成或成功**；`provisioning`/`failed` 描述创建过程——这种区分度很多产品没有 |
| 6 | **工具面小而完整** | 9 个工具，Lead 与 teammate schema 相同、权限在执行期判；紧凑 JSON 结果（明确为省 token 拒绝缩进） |
| 7 | **UI 与会话导航打通** | Web 头部 actions 槽 → roster + 只读任务板 + 点进某队友会话（走既有的 addressed-subagent `mode: continuable` 路径）；数据全来自共享 Session store 的 `agentTeam` projection |
| 8 | **与既有体系不冲突** | 以**同名工具遮蔽** legacy 全局控件；`subagent`/`subagent_fork` 被禁用但 Subagent 服务与 spawn/fork provider **保留**；**workflow 仍可用** |
| 9 | **官方维护** | 随 DSH 版本同步演进，不需第三方追版本 |

---

## 3. Agent Teams 的真实短板（劣势）

| # | 短板 | 具体事实（带证据） |
|---|---|---|
| 1 | **同进程 + 同 checkout，没有隔离** | 所有成员共享 cwd，编辑立即可见；README 明说「provides **no worktree, remote member, merge, or filesystem lock**」 |
| 2 | **写入安全只有「建议」** | `writeScopes` 只做**前缀重叠告警**，`never block claim or authorize writes`；Bash / formatter / codegen / 外部写入者**绕过**文件版本护栏。官方设计原则原话：认为「false mutual exclusion is more dangerous than an explicit warning」 |
| 3 | **权威单点、名单扁平不可变** | 只有 Lead 能创建/中断/重派；**不可嵌套**（flat immutable roster）；名字**永久占用**（含创建失败的）；无改名 / 删除 / 名字复用 |
| 4 | **无成本护栏** | 没有 rounds / turn / token / 预算任何上限；只能靠 `maxMembers` / `maxTasks` / 每条数 / 单条字节间接约束 |
| 5 | **固定开销压在每次请求上** | 每个 Team 成员每次请求都付 policy 段 + 9 个 schema；官方**没有给出任何 token 数字** |
| 6 | **实验性、无稳定性承诺** | 三个包都自述 「Experimental prototype with no stability promise」，`contracts/schemas can change freely`；不宜作为长期集成依赖 |
| 7 | **默认关闭 + 晚启用要刷新页** | bundle opt-in；已在打开的会话里启用后，**需要刷新页面**才能收到 Team projection |
| 8 | **Web UI 只读** | 面板不能 spawn / rename / delete / interrupt，也不能改任务；**不展示消息时间线**（无 mailbox UI） |
| 9 | **广播开销偏大** | 任一 roster/task 变化都向**每个**已连接浏览器推送**完整** roster + 完整任务板（**含描述**），即使该浏览器在看别的会话 |
| 10 | **已知延期缺陷** | in-process one-shot children 在 descriptor 发布**之前**就被误判为 Team 成员，从而被注入 Team 工具（「Correcting installation timing is deferred」）；workflow 的 children 同样受影响 |
| 11 | **不能自动组队** | 普通任务不会触发委派，必须用户显式要求——想「自动分工」需自己在外层补 |
| 12 | **无自动释放 owner** | 成员 inactive / 被打断 / 进程退出 / 工作失败，**都不会**释放它占着的任务 |

---

## 4. 本项目相对 Agent Teams 的优势

| # | 优势 | 说明 | 证据 / 落点 |
|---|---|---|---|
| 1 | **token 经济可控** | 「AI 模式」是 token 总闸，关闭即每轮**零内核 token**。Agent Teams 的 policy + 9 schema 是每成员每请求的**固定**开销，无开关 | 本仓库设置项 `aiMode`；README 零消耗保证 |
| 2 | **零运行隔离风险** | 不碰文件系统、不并发写盘、不共享 checkout，因此不存在「建议性作用域被 Bash 绕过」这类问题 | 本插件只做 system prompt 分段 + 可选单次 LLM 调用 |
| 3 | **补上 Agent Teams 完全不做的那一层** | Agent Teams 解决「谁来干活」，不解决「怎么干才对」。智子把「先问清 → 定版 → 过审 → 验证 → 交付」的**工作法**钉进每一轮 | 五策 + 规模路由 S/M/L + 质量闸（不过闸不交付） |
| 4 | **可按档位/语言/语气配置** | `minimal` / `balanced` / `full` × `zh` / `en` × 语气/自称/称呼，且支持自定义内核覆盖 | 设置页 → 三体 |
| 5 | **可视化进度与状态** | 头顶进度 + 短标题 + 悬浮展开步骤列表，宠物情绪态挂载会话 running 信号 | 悬浮智子 |
| 6 | **声明了明确的双线兼容** | `>=0.1.0-rc.7 <0.3.0` peer + `engines.dsh` + 兼容台账 + 元数据闸门测试 | `package.json`、`tests/metadata-compat.test.mjs` |
| 7 | **不依赖实验性契约** | 只用 DSH 已验证的公开接缝（systemPrompt.section / slots / locale / settings），且对两代形状做嗅探降级 | `lib/settings-host.js`、`src/client/settings-adapter.js` |

---

## 5. 本项目相对 Agent Teams 的劣势

| # | 劣势 | 说明 |
|---|---|---|
| 1 | **不做多智能体** | 没有队友、没有共享任务板、没有 CAS、没有持久消息。要「多人分工」只能靠 Agent Teams / subagent / workflow |
| 2 | **没有崩溃恢复语义** | 不落任何协作状态；Agent Teams 的 projection 重放 + 邮箱重投是它的硬实力 |
| 3 | **没有任务依赖图** | 不做 blocked_by / readiness / DAG 校验 |
| 4 | **不是官方维护** | 需自己追 DSH 版本（本项目已因此踩过 0.2.0 的设置系统替换） |
| 5 | **影响面偏「软」** | 内核是提示词层约束，**不是**强制执行；Agent Teams 的任务板 CAS 是硬机制 |
| 6 | **0.2 路径无真机验证** | 本机运行时为 0.1.7-rc.2，0.2 侧只有源码级证据 + 假 ctx 单测 |

---

## 6. 结论：该用哪个

| 你的诉求 | 建议 |
|---|---|
| 让一个 Agent 把「需求 → 方案 → 交付」做扎实 | **智子**（本项目） |
| 让多个 Agent 并行分工、任务可追踪、崩溃不丢 | **官方 Agent Teams**（接受其同进程/无锁/实验性） |
| 两者都要 | **组合**：用 Agent Teams 做分工，把智子内核注入到 Lead 与 teammate（内核是 system prompt 分段，天然对每个 Agent 生效） |
| 要进程/工作区级隔离 | 两者都不提供；需自建 worktree 编排或改用独立进程方案 |
| 成本敏感、任务简单 | 只开智子的 `minimal` 档；**不要**开 Agent Teams（省掉固定 policy + 9 schema 开销） |

---

## 7. 组合使用的两个注意点

1. **Agent Teams 装 bundle 后会禁用 `subagent` / `subagent_fork`**，并遮蔽同名全局控制（`send_message` / `list_agents` / `interrupt_agent`）。若你的流程依赖 `subagent_fork`，需要显式评估替代路径（`spawn_teammate(context: 'fork')`）。
2. **晚启用需刷新页面**才能看到 Team projection；且写作用域只是建议，Lead 必须自己审最终 diff 并跑测试（本仓库的 `tests/` 正是这种「Lead 终审」的落地样例）。
