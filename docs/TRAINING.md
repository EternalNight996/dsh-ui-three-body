# 训练闭环：从「即时内核」到「真正训练」的长线方案

当前版本是**即时内核注入**——每次对话注入一段静态内核，无状态、无记忆。它能让智能体「当下更懂你」，但不会「越用越懂你」。

「真正的训练」= 三步闭环：**捕获反馈 → 沉淀偏好 → 召回注入**。下面是分阶段的长线方案。

## 核心思路

不微调模型（重、贵、慢），而是**把每次「准/驳」反馈沉淀成结构化偏好，再作为动态上下文按需注入**。这正是 DSH 的 `systemPrompt.context`（动态上下文）与 `variable`（提示变量）设计的用途。

## 阶段路线

### Phase 1 · 捕获反馈（v0.2）

- 新增 `beast_remember` host 工具：agent 在「呈策→主上定夺」后调用，记录 `{ task, verdict(准/驳), note }`。
- 内核第三式加一句：「定夺后调用 beast_remember 记下主上的好恶」。
- 存储：`~/.dsh/dsh-ui-three-body/prefs.json`（纯 JSON 文件，参考 pixe 的 `custom-roles.json`，无需引入存储服务）。

### Phase 2 · 沉淀偏好（v0.3）

- 把零散反馈提炼成结构化偏好（一个 LLM 调用，或确定性规则）：
  ```json
  {
    "style": ["简约", "深色"],
    "stack": ["React", "Node"],
    "delivery": "分段",
    "tone": "傲慢但简洁",
    "successCriteria": ["手机端可用", "可部署"],
    "avoid": ["过度设计", "多余动画"]
  }
  ```
- 冲突处理：新反馈覆盖旧偏好；每条带 `updatedAt`。

### Phase 3 · 召回注入（v0.4）

- host 侧用 `ctx.systemPrompt.context({ name: 'beast-tamer:prefs', order: 900, text })` 注入偏好摘要（**动态上下文，优先级低于静态内核**，不污染内核主体）。
- token 纪律：偏好摘要压到 3-5 行；仅在**相关**时注入（按当前任务关键词粗匹配），不是每轮都塞。
- 结果：内核保持固定，偏好随用户动态增长——「越用越懂你」且不膨胀。

### Phase 4 · 跨会话与共享（远期）

- 多 workspace/profile 隔离或共享偏好。
- 可选：偏好导出/导入（像 pixe 的团队备份）。
- 可选：接入 agentmemory（`remember`/`recall`）做更语义化的长期记忆；但 Phase 1-3 的纯 JSON 方案对单机够用，**不建议**一上来就上向量库。

## 关键 DSH 原语

| 需求 | 原语 |
| --- | --- |
| 捕获 OK/NG | `beast_remember` 工具 + `session` 事件（`tool/result`、`user/message`） |
| 持久化 | 纯 JSON 文件（`~/.dsh/dsh-ui-three-body/prefs.json`）或 `storage` 服务 |
| 注入偏好 | `systemPrompt.context()`（动态，可排序、可 per-session） |
| 按需召回 | `systemPrompt.variable()` 或 context 内做轻量匹配 |

## 为什么不微调

- 微调需要数据集 + 训练 + 部署，周期以天计，且每次偏好变化要重训。
- 提示词召回是**即时、可解释、可撤销**的，token 成本可精确控制。
- 你的「最少 token」哲学与提示词召回天然契合。

## 落地顺序建议

1. 先做 Phase 1（`beast_remember` + prefs.json），成本最低、立刻有「记忆感」。
2. Phase 2/3 一起做（沉淀 + 注入），这一步就是「真正的训练」。
3. Phase 4 看用户规模再决定。

> 需要我先实现 Phase 1 吗？（一个 `beast_remember` 工具 + prefs.json 读写 + 内核一句引导，约 60 行）
