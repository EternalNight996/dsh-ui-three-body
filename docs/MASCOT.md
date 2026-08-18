# 萌宠立绘 & 情绪表达方案

> ✅ **已落地：程序化内联 SVG + CSS（零依赖）**。`BeastMascot` 画了一个「圆脸小兽 + 呆毛 + 领巾 + 耳朵 + 尾巴」矢量，情绪由参数驱动而非成片动画：
> - 呼吸频率（休眠极慢 / 待命正常 / 工作快且幅度大）
> - 尾巴摆动速度（随状态变）
> - 随机眨眼（2~6s 随机间隔，活物感）
> - 眼睛跟随鼠标（瞳孔随光标偏移，休眠时闭眼）
> - 点击弹性 pop
>
> 完全国内可用、零外部服务、client bundle 仅 ~18KB。**想更好看**：用 Figma/即时设计画一个 SVG 萌宠，替换 `BeastMascot` 里的矢量（保持 viewBox 96×96），动画逻辑一行都不用动。

## 当初的备选方案（供参考）

| 方案 | 表现力 | 体积 | 落地成本 | 适用 |
| --- | --- | --- | --- | --- |
| **① Lottie 矢量动画** ⭐推荐 | 高（平滑 2D 表情） | 极小（JSON，几十 KB） | 中（设计一张图 → AE/Bodymovin 导出） | 想要「会眨眼、会摇尾巴」的精致 2D 萌宠 |
| ② 像素小人（Canvas/SVG） | 中（复古质感） | 小 | 低 | 与 pixe「像素办公室」风格统一 |
| ③ 序列帧 / CSS sprite | 中 | 中 | 低 | 已有 GIF/PNG 序列可直接用 |
| ④ Live2D（Cubism） | 很高（2D 立绘可动） | 大（运行时 ~1MB） | 高 | 二次元立绘、头部跟随鼠标 |
| ⑤ 3D（VRM + three.js） | 最高（真 3D） | 大（模型 + three.js） | 很高 | 想要「3D 驯兽师模型」 |

## 情绪态映射（已实现 + 建议扩展）

当前 3 态足够用，建议按需扩展到 6 态：

| 情绪 | 触发信号 | 视觉 |
| --- | --- | --- |
| 😴 休眠 | `enabled = false` | 灰度 + 静止 |
| 🐾 待命 | `enabled = true` 且无会话 running | 缓慢上下浮动（bob） |
| 🤔 思考 | 会话 running 但尚无工具调用 | 眨眼 / 歪头 |
| 🔥 工作 | 会话 running（`sessions.list` 当前行 `running=true`） | 快速脉冲 / 尾巴摆动 |
| ✅ 完成 | 会话 `running` 翻转为 false 且 `completed` | 欢呼 / 小跳 |
| ❗ 反应 | 点击切换 | 弹出（pop）放大 |

> 「思考 vs 工作」的区分需要订阅会话事件流（`sessions` + 工具调用事件），当前骨架只做到「running 与否」，够用；要做到「思考中」再接 `sessions.list` 的 `pendingInteraction` 或工具事件。

## 推荐路径

1. **短期（本周）**：保持 emoji 三态（已可用），只把 `assets/pet.svg` 换成你自己的立绘，`BeastPet` 里的 `face` 改成 `<img src={...}>`。
2. **中期**：上 **Lottie**（JSON 动画），按 6 态准备 6 段动画，`face` 换成 `<lottie-player>`（或引入 `lottie-web`，标记为 external）。
3. **若想真 3D**：用 **VRM + three.js**，`BeastPet` 挂一个 `<canvas>` 渲染模型；three.js 走 peerDependency（dsh 运行时可能已带，避免重复打包）。

关键：无论哪种，都只改 `BeastPet` 一个组件的渲染层，情绪态信号（`enabled` / `running`）已经接好，不用动 host。

## 落地清单（需要你补充）

- [ ] 决定用哪个方案（推荐 ① Lottie 或 ② 像素）
- [ ] 出 3-6 张表情/动画
- [ ] 替换 `assets/pet.svg` + `BeastPet` 的 `face` 渲染
- [ ] （可选）接 `sessions` 事件流做「思考/完成」细分态
