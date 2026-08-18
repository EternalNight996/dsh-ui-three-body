# beast_analyze：需求剖析工具的「更好方案」

内核是**行为指令**（agent 在对话里自动执行四式流程），零 token 成本，但有两个短板：**输出格式不统一**、**审核不是真门槛**（只是文字，不是交互确认）。

所以「更好的方案」不是再造一个独立流程，而是**用 DSH 已有的、久经考验的原语，把流程的三个环节各自做实**：

## 三件套组合

| 环节 | 用什么 | 说明 |
| --- | --- | --- |
| ① 剖析 → 规范计划 | `beast_analyze`（本插件 host 工具） | 联动当前模型，一次调用产出统一四节 markdown |
| ② 审核门（OK/NG） | `ask_user_question`（DSH 内置） | 真·交互确认，用户点「准/驳」，不是纯文字 |
| ③ 执行 + 监督 | `create_goal` + `todo_write`（DSH 内置） | 长任务用 goal 跟踪、步骤用 todo 打勾 |

内核第三式/第四式已显式指向这三件套（`ask_user_question` / `create_goal` / `todo_write`）。

## 为什么这比「只加一个工具」更好

1. **不重造轮子**：审核、监督是通用能力，DSH 已有成熟实现，复用即可。
2. **可组合、可替换**：每件独立；哪天不用 goal 了换别的监督工具，不动其他。
3. **token 经济可调**：`beast_analyze` 默认**关**（内核行为流 = 0 额外 token）；想要「一键生成规范计划」才开，每次多一次模型调用。

## beast_analyze 已实现（本插件）

- 输入：`requirement`（原始需求）+ 可选 `context`（背景）。
- 输出：统一四节 markdown —— `需求剖析 / 目标 / 分步计划 / 验收标准`。
- 复用当前 `llm` 服务（第一个 provider 的旗舰模型），`reasoningEffort: off` + `maxTokens: 1200` 控制成本。
- 设置页开关 `analyzeTool`（默认关）。

## 更进一步的选项（供你选）

- **A. 命令形态**：把四式流程做成 `/tame` 命令（`dsh-commands`），用户一键触发，比「等 agent 想起来调用工具」更可控。
- **B. Skill 形态**：把四式流程 + 工具组合写成 `beast-tamer` skill，需要时 `skill` 加载，不占常驻内核 token。
- **C. 保持现状**：内核行为流已够用，`beast_analyze` 作为可选增强。

> 建议：默认走 **A（/tame 命令）**——最符合「一键生成 markdown 计划」的直觉，且不占常驻 token。需要我实现吗？
