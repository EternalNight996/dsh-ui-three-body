# Character360 · 视频环绕跟随帧代码（供 dsh-ui-deep-theme 照搬）

> 来源：`meng-you/web/src/components/Character360.tsx`（[meng-you](https://github.com/EternalNight996/meng-you)）。
> 用途：dsh-ui-deep-theme 的动态视频皮肤「鼠标左右滑动 = 环绕旋转帧」的**参考实现**，可直接照搬（改动 src 为本地静态资源路径、移除 Next.js "use client" 即可）。

## 原理

一段首尾无缝的环绕视频当作**可实时 seek 的帧时间轴**：禁用 autoplay、隐藏控件，鼠标绕屏幕中心转一圈 → `currentTime` 从 0 扫到 `duration`，角色/画面相应转向。

**角度映射公式**：

```
angle   = Math.atan2(mouseY - cy, mouseX - cx)      // [-π, π]，鼠标相对屏幕中心
START   = -3π/4                                     // 起点 Top-Left
t       = wrap01((angle - START) / (2*Math.PI))     // 归一化 [0,1)
video.currentTime = t * video.duration
```

## 完整代码（直接可复制）

```tsx
import { useEffect, useRef } from "react";

function wrap01(v: number) {
  return v - Math.floor(v);
}

export default function Character360({
  srcWebm = "/videos/main-compressed.webm",
  srcMp4 = "/videos/main-compressed.mp4",
  className = "",
  hint = false,
}: {
  srcWebm?: string;
  srcMp4?: string;
  className?: string;
  hint?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const START = (-3 * Math.PI) / 4; // Top-Left 起始点 Os

    let current = 0.02; // 归一化时间比例 [0,1)
    let target = current;
    let raf = 0;
    let ready = false;
    let lastSeek = 0;
    let lastMove = 0;
    const IDLE_MS = 500; // 鼠标静止 500ms 后停止 seek 循环，省资源且不损画质

    const DURATION = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5);

    // 1080p/60fps 解码较重：降低 seek 频率（约 16Hz）并跳过微小位移。
    const seekTo = (t: number) => {
      if (!Number.isFinite(t)) return;
      const now = performance.now();
      if (now - lastSeek < 60) return; // ~16Hz，防止高清频繁 seek 卡顿
      if (video.seeking) return; // 正在 seek，跳过本次，下一帧 rAF 再试
      const next = t * DURATION();
      if (Math.abs(next - video.currentTime) > 0.02) { // 位移太小不 seek
        video.currentTime = next;
        lastSeek = now;
      }
    };

    // 到位且鼠标静止超时 → 停止循环，避免 rAF 空转浪费
    const step = () => {
      let diff = target - current;
      diff -= Math.round(diff); // wrap 到 [-0.5, 0.5]：走最短路径
      const done = Math.abs(diff) < 0.004;
      current = wrap01(current + diff * 0.14);
      seekTo(current);
      if (done && performance.now() - lastMove > IDLE_MS) {
        raf = 0; // 停止：等待下一次 mousemove 重新启动
        return;
      }
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    const onMove = (e: MouseEvent) => {
      lastMove = performance.now();
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
      target = wrap01((angle - START) / (2 * Math.PI));
      start(); // 鼠标移动才驱动动画循环
    };

    const onLoaded = () => {
      ready = true;
      seekTo(current);
      if (video.readyState >= 2) {
        video.play().then(() => video.pause()).catch(() => {});
      }
      start();
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    if (video.readyState >= 1) onLoaded();
    start();

    return () => {
      window.removeEventListener("mousemove", onMove);
      video.removeEventListener("loadedmetadata", onLoaded);
      cancelAnimationFrame(raf);
      ready = false;
    };
  }, [srcWebm, srcMp4]);

  return (
    <div aria-hidden className={"absolute inset-0 overflow-hidden " + className}>
      <video
        ref={videoRef}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        className="h-full w-full object-cover"
      >
        <source src={srcWebm} type="video/webm" />
        <source src={srcMp4} type="video/mp4" />
      </video>
    </div>
  );
}
```

## 关键优化点（照搬时保留）

| 点 | 说明 |
|---|---|
| `prefers-reduced-motion` | reduce 时直接不驱动，停在初始帧（无障碍 + 省资源） |
| rAF + 最短路径 lerp | `diff -= Math.round(diff)` wrap 到 [-0.5,0.5]，扫过 ±π 边界不回跳 |
| seek 节流 ~16Hz | `now - lastSeek < 60` 跳过，防高清频繁 seek 卡顿 |
| 位移阈值 0.02s | 太小不 seek，减少无谓解码 |
| `video.seeking` 跳过 | 正在 seek 不堆积，下一帧 rAF 再试 |
| 鼠标静止 500ms 停 rAF | 到位即停，不空转 |
| background 层 | `absolute inset-0` + `pointer-events-none`，不拦截交互 |
| `mousemove` 在 window | 视频层不可点时交互依旧生效 |

## 视频素材

- 默认：`/videos/main-compressed.mp4`（[meng-you](https://github.com/EternalNight996/meng-you) 项目，`web/public/videos/main-compressed.mp4`，压缩版 1080p，6.3MB）
- 配套 webm 主源：`/videos/main-compressed.webm`（VP9/10-bit，减少色带；H.264 作 Safari 回退）

---
> 相关开发目标文本见 [DEEP_THEME_SPEC.md](./DEEP_THEME_SPEC.md)。
