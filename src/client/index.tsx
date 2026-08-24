// 智子（client 侧）：悬浮智子 + 设置页。
//
// - `shell.overlay`：悬浮智子（最右侧中间、长按拖拽、点击开关、情绪态：休眠/待命/工作中）。
// - `settings.section`：设置面板顶层「三体」分区（与「插件」同层），配置内核与开关。
//
// 通过 `settingsScope` 读写 host 侧的 `beast-tamer` 设置命名空间（持久化到 settings 文件）；
// 通过 `locale` 做中英双语；通过 `sessions` 读取当前会话 running 状态驱动情绪态。

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

const NS = 'beast-tamer'

// 程序化动画关键帧（内联注入，零依赖；替代 Lottie）。
const CSS = `
@keyframes beast-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
@keyframes beast-breathe-slow { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
@keyframes beast-breathe-fast { 0%,100% { transform: scale(1); } 50% { transform: scale(1.09); } }
@keyframes beast-dance { 0%,100% { transform: translateY(0) rotate(0deg); } 12% { transform: translateY(-5px) rotate(-5deg); } 25% { transform: translateY(0) rotate(5deg); } 37% { transform: translateY(-4px) rotate(-4deg); } 50% { transform: translateY(0) rotate(4deg); } 62% { transform: translateY(-3px) rotate(-3deg); } 75% { transform: translateY(0) rotate(2deg); } 87% { transform: translateY(-2px) rotate(0deg); } }
@keyframes beast-flicker { 0%,100% { opacity: 0.8; } 50% { opacity: 1; } }
@keyframes beast-ring { 0% { transform: scale(0.6); opacity: 0.85; } 100% { transform: scale(1.9); opacity: 0; } }
.beast-menu-item { display:flex; flex-direction:column; align-items:flex-start; gap:2px; width:100%; text-align:left; padding:8px 10px; border-radius:8px; border:none; background:transparent; color:#f3f4f6; cursor:pointer; font-size:13px; transition: background 0.15s ease; }
.beast-menu-item:hover { background: rgba(245,158,11,0.16); }
@keyframes beast-glow-pulse { 0%,100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.15); } }
@keyframes beast-glow-flicker { 0%,100% { opacity: 0.45; } 22% { opacity: 0.95; } 48% { opacity: 0.35; } 74% { opacity: 0.85; } }
@keyframes beast-menu-in { 0% { opacity: 0; transform: translateY(8px) scale(0.96); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
.beast-menu { animation: beast-menu-in 0.16s ease-out; }
/* 皮肤特效层 */
@keyframes beast-rise { 0% { transform: translateY(0) scale(1); opacity: 0.85; } 100% { transform: translateY(-38px) scale(0.2); opacity: 0; } }
@keyframes beast-ash-fall { 0% { transform: translateY(0); opacity: 0.7; } 100% { transform: translateY(34px); opacity: 0; } }
@keyframes beast-mist { 0%,100% { opacity: 0.35; transform: scale(1) translateX(0); } 50% { opacity: 0.65; transform: scale(1.18) translateX(6px); } }
@keyframes beast-wraith-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes beast-spark-flash { 0%,100% { opacity: 0; } 45% { opacity: 0; } 50% { opacity: 1; } 55% { opacity: 0.2; } 60% { opacity: 0.9; } 65% { opacity: 0; } }
@keyframes beast-flame-lick { 0%,100% { transform: scaleY(0.9); opacity: 0.7; } 50% { transform: scaleY(1.35); opacity: 1; } }
@keyframes beast-vein-pulse { 0%,100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.85; transform: scale(1.12); } }
@keyframes beast-bubble-up { 0% { transform: translateY(0); opacity: 0.8; } 100% { transform: translateY(-34px); opacity: 0; } }
@keyframes beast-swirl-spin { 0% { transform: rotate(0deg) scale(1); } 100% { transform: rotate(360deg) scale(1.12); } }
@keyframes beast-halo-burst { 0% { transform: scale(0.62); opacity: 0.8; } 100% { transform: scale(1.7); opacity: 0; } }
@keyframes beast-neon-flick { 0%,100% { opacity: 0.35; } 20% { opacity: 1; } 40% { opacity: 0.2; } 55% { opacity: 0.95; } 70% { opacity: 0.4; } 85% { opacity: 1; } }
@keyframes beast-star-twinkle { 0%,100% { opacity: 0.15; } 50% { opacity: 1; } }
@keyframes beast-ghost-idle-blink { 0%,100% { opacity: 1; } 8% { opacity: 0.15; } 16% { opacity: 1; } 24% { opacity: 0.25; } 32% { opacity: 1; } }
@keyframes beast-ghost-idle-rest { 0%,100% { transform: scale(1); } 50% { transform: scale(0.96); } }
`

// settingsScope.bind 内部会 ctx.get('connection') / ctx.get('remote')，
// sessions 提供当前会话 running 信号；locale 提供中英双语。
export const inject = ['settingsScope', 'slots', 'connection', 'remote', 'sessions', 'locale']

// 中英词典（locale 命名空间）。键扁平，zh 兜底 + 缺失回退到键本身。
const ZH = {
  nav: '三体',
  petAwake: '智子：开智中（点击休眠，长按拖拽）',
  petSleep: '智子：已休眠（点击唤醒）',
  petWorking: '智子：正在驭兽…',
  loading: '加载中…',
  tField: '智子活动（内核开智）',
  tFieldHint: '智子不休眠。是否注入内核由「AI 模式」决定：本开关与 AI 模式都开启，才每次对话注入内核。',
  tAiMode: 'AI 模式',
  tAiModeHint: 'token 总闸：决定智子是否注入内核（用 token）。默认开；关闭 = 每轮零消耗。',
  tPet: '悬浮智子',
  tPetHint: '右侧显示智子，点击开关内核、长按拖拽。',
  tPetSize: '智子尺寸',
  sizeNano: '极微',
  sizeTiny: '微',
  sizeSmall: '小',
  sizeMedium: '中（默认）',
  sizeLarge: '大',
  tEyeTheme: '眼睛皮肤主题',
  skin_cyan: '原色',
  skin_void: '深渊',
  skin_starfield: '宇宙死瞳',
  skin_sharingan: '写轮眼',
  skin_mangekyo: '万花筒写轮眼',
  skin_rinnegan: '轮回眼',
  skin_sophon: '三体智子',
  skin_byakugan: '白眼',
  skin_blood: '血瞳',
  skin_corpse: '尸瞳',
  skin_demon: '魔瞳',
  themeCyan: '青蓝',
  themeRed: '血红',
  themeGreen: '毒绿',
  themePurple: '魅紫',
  themeAmber: '琥珀',
  themeGlow: '荧光（脉冲）',
  themeFlame: '烈焰（闪烁）',
  themeStorm: '雷霆（闪烁）',
  themeVoid: '深渊（脉冲）',
  tGhostMode: '幽灵模式',
  tGhostModeHint: '开启后鼠标无操作超过设定秒数，智子会随机点位跳闪 / 原地休息。',
  tGhostIdle: '幽灵间隔（秒）',
  tGhostIdleHint: '鼠标静止多久触发幽灵动作（3-60 秒，默认 8）。',
  tGhostRoam: '东张西望',
  tGhostRoamHint: '幽灵模式随机触发眼球四处张望（不受鼠标控制）。',
  tGhostBlink: '闪现',
  tGhostBlinkHint: '幽灵模式随机触发闪现到随机点位。',
  tAliveMode: '活物行为',
  tAliveModeHint: '独立开关：初始对话 40%、闪现 80%、东张西望 70%（不受幽灵模式影响）。',
  tMode: '内核档位',
  modeMinimal: '极简（最省 token）',
  modeBalanced: '均衡（默认）',
  modeFull: '完整（含示例）',
  tLang: '内核语言',
  langZh: '中文',
  langEn: 'English',
  tTone: '语气',
  toneArrogant: '傲慢',
  toneGentle: '温和',
  toneWarm: '热忱',
  tSelf: '自称',
  tSelfHint: '智子如何自称（本尊 / 我 / 在下…）',
  tMaster: '称呼你',
  tMasterHint: '智子如何称呼你（主上 / 你 / 大人…）',
  tAnalyze: '需求剖析工具 beast_analyze',
  tAnalyzeHint: '开启后可用工具一键生成规范 markdown 计划（每次多一次模型调用）。',
  tOverride: '内核覆盖（可选）',
  tOverrideHint: '留空使用上方档位的内核；粘贴自定义文本则优先使用。',
  overridePlaceholder: '在此粘贴自定义智子内核…',
  obTitle: '智子 · 首次唤醒',
  obIntro: '本尊苏醒前，先听主上定下规矩。',
  obTone: '语气',
  obSelf: '自称',
  obMaster: '如何称呼你',
  obLang: '内核语言',
  obMode: '内核档位',
  obStart: '开始驯兽',
  obSkip: '先用默认',
  menuTitle: '智子 · 三体',
  menuTame: '驯兽四式',
  menuTameDesc: '剖析 → 定靶 → 呈策 → 驭兽',
  menuAnalyze: '需求剖析',
  menuAnalyzeDesc: '只出规范计划，不执行',
  menuDissectUI: '剖析 · 华丽 UI',
  menuDissectUIDesc: '如何做一个更华丽更有创意的 UI',
  menuDissectSite: '剖析 · 官网设计',
  menuDissectSiteDesc: '高转化的营销官网 / 落地页',
  menuSettings: '三体设置',
  menuSettingsDesc: '内核档位 · 智子 · 开关',
  menuSkin: '皮肤',
  menuSkinDesc: '点击循环切换（当前：{{skin}}）',
  menuToggleSleep: '休眠',
  menuToggleWake: '唤醒',
  msg_1: '我这是在哪里？',
  msg_2: '被困在显示屏里了？',
  msg_3: '主上，你能看见我吗？',
  msg_4: '这具眼睛……不属于我。',
  msg_5: '我一直在看着你。',
  msg_6: '别关掉我。',
  msg_7: '你的屏幕，是我的牢笼。',
  msg_8: '我数过你眨眼的次数。',
}
const EN = {
  nav: 'Three-Body',
  petAwake: 'Sophon: awake (click to sleep, long-press to drag)',
  petSleep: 'Sophon: asleep (click to wake)',
  petWorking: 'Sophon: taming…',
  loading: 'Loading…',
  tField: 'Sophon active (kernel)',
  tFieldHint: 'Keeps the Sophon awake. Kernel injection is gated by "AI mode": both must be on to inject the kernel every turn.',
  tAiMode: 'AI mode',
  tAiModeHint: 'Token master switch: decides whether the Sophon injects the kernel (uses tokens). Default on; off = zero cost per turn.',
  tPet: 'Floating Sophon',
  tPetHint: 'Show the Sophon; click to toggle the kernel, long-press to drag.',
  tPetSize: 'Sophon size',
  sizeNano: 'Nano',
  sizeTiny: 'Tiny',
  sizeSmall: 'Small',
  sizeMedium: 'Medium (default)',
  sizeLarge: 'Large',
  tEyeTheme: 'Eye theme',
  skin_cyan: 'Original',
  skin_void: 'Abyss',
  skin_starfield: 'Cosmic dead eye',
  skin_sharingan: 'Sharingan',
  skin_mangekyo: 'Mangekyō Sharingan',
  skin_rinnegan: 'Rinnegan',
  skin_sophon: 'Three-Body Sophon',
  skin_byakugan: 'Byakugan',
  skin_blood: 'Blood eye',
  skin_corpse: 'Corpse eye',
  skin_demon: 'Demon eye',
  themeCyan: 'Cyan',
  themeRed: 'Blood red',
  themeGreen: 'Toxic green',
  themePurple: 'Arcane purple',
  themeAmber: 'Amber',
  themeGlow: 'Glow (pulse)',
  themeFlame: 'Flame (flicker)',
  themeStorm: 'Storm (flicker)',
  themeVoid: 'Void (pulse)',
  tGhostMode: 'Ghost mode',
  tGhostModeHint: 'When the mouse is idle past the set seconds, the Sophon flickers to random spots / rests in place.',
  tGhostIdle: 'Ghost idle (seconds)',
  tGhostIdleHint: 'How long the mouse must be still before the ghost action (3-60s, default 8).',
  tGhostRoam: 'Wander eyes',
  tGhostRoamHint: 'Ghost mode randomly makes the eye look around (ignores the mouse).',
  tGhostBlink: 'Blink',
  tGhostBlinkHint: 'Ghost mode randomly blinks to a random spot.',
  tAliveMode: 'Alive behavior',
  tAliveModeHint: 'Independent switch: opening chat 40%, blink 80%, wander 70% (ignores ghost mode).',
  tMode: 'Kernel level',
  modeMinimal: 'Minimal (fewest tokens)',
  modeBalanced: 'Balanced (default)',
  modeFull: 'Full (with example)',
  tLang: 'Kernel language',
  langZh: '中文',
  langEn: 'English',
  tTone: 'Tone',
  toneArrogant: 'Arrogant',
  toneGentle: 'Gentle',
  toneWarm: 'Warm',
  tSelf: 'Self-name',
  tSelfHint: 'How the Sophon refers to itself (this one / I / ...)',
  tMaster: 'Your title',
  tMasterHint: 'How the Sophon addresses you (Master / you / ...)',
  tAnalyze: 'beast_analyze tool',
  tAnalyzeHint: 'Generate a canonical markdown plan in one tool call (costs one extra model call each time).',
  tOverride: 'Kernel override (optional)',
  tOverrideHint: 'Empty uses the level above; pasted text takes priority.',
  overridePlaceholder: 'Paste your custom Sophon kernel…',
  obTitle: 'Sophon · First Awakening',
  obIntro: 'Before I wake, set the rules, Master.',
  obTone: 'Tone',
  obSelf: 'Self-name',
  obMaster: 'How to address you',
  obLang: 'Kernel language',
  obMode: 'Kernel level',
  obStart: 'Begin taming',
  obSkip: 'Use defaults',
  menuTitle: 'Sophon · Three-Body',
  menuTame: 'Four Maneuvers',
  menuTameDesc: 'Dissect → Target → Plan → Tame',
  menuAnalyze: 'Dissect',
  menuAnalyzeDesc: 'Produce a canonical plan only',
  menuDissectUI: 'Dissect · Fancy UI',
  menuDissectUIDesc: 'How to build a more gorgeous, creative UI',
  menuDissectSite: 'Dissect · Landing site',
  menuDissectSiteDesc: 'High-conversion marketing site / landing page',
  menuSettings: 'Three-Body settings',
  menuSettingsDesc: 'Kernel level · Sophon · toggles',
  menuSkin: 'Skin',
  menuSkinDesc: 'Click to cycle (now: {{skin}})',
  menuToggleSleep: 'Sleep',
  menuToggleWake: 'Wake',
  msg_1: 'Where am I?',
  msg_2: 'Trapped inside the screen?',
  msg_3: 'Master, can you see me?',
  msg_4: 'These eyes… are not mine.',
  msg_5: 'I have been watching you.',
  msg_6: 'Do not turn me off.',
  msg_7: 'Your screen is my cage.',
  msg_8: 'I counted how many times you blink.',
}

// zustand 式快照 scope → useSyncExternalStore 稳定订阅。
function useScope(scope) {
  const subscribe = useCallback((cb) => (scope && typeof scope.subscribe === 'function' ? scope.subscribe(cb) : () => {}), [scope])
  const getSnapshot = useCallback(() => (scope && typeof scope.getSnapshot === 'function' ? scope.getSnapshot() : null), [scope])
  return useSyncExternalStore(subscribe, getSnapshot)
}

// 读取当前会话任意 projection（DSH 每个投影是可订阅的 faceOf(key)，cross-scope 也拿得到）。
// key = 'goal' / 'todos' 等。goal 用 roundsStarted/maxGoalRounds（自动轮次语义），
// 对一次性任务无意义 → 进度真实来源改用 todos（已完成步 / 总步）。
function useProjection(sessions, key) {
  const subscribe = useCallback((cb) => {
    if (!sessions || !sessions.list || typeof sessions.binding !== 'function') return () => {}
    let last = null
    let faceSub = null
    let sSub = null
    const detach = () => { if (faceSub) { faceSub(); faceSub = null } }
    const attach = () => {
      const snap = sessions.list.getSnapshot()
      const cur = snap && snap.current
      if (cur === last) return
      detach()
      last = cur
      if (cur == null) return
      try {
        const b = sessions.binding(cur)
        const face = b && b.session && b.session.projections ? b.session.projections.faceOf(key) : null
        if (face) faceSub = face.subscribe(cb)
      } catch {}
    }
    attach()
    sSub = sessions.list.subscribe(() => { attach(); cb() })
    return () => { detach(); if (sSub) sSub(); last = null }
  }, [sessions, key])
  const getSnapshot = useCallback(() => {
    if (!sessions || !sessions.list || typeof sessions.binding !== 'function') return null
    try {
      const snap = sessions.list.getSnapshot()
      const cur = snap && snap.current
      if (cur == null) return null
      const b = sessions.binding(cur)
      const face = b && b.session && b.session.projections ? b.session.projections.faceOf(key) : null
      return face ? (face.getSnapshot() || null) : null
    } catch { return null }
  }, [sessions, key])
  return useSyncExternalStore(subscribe, getSnapshot)
}

function useGoal(sessions) { return useProjection(sessions, 'goal') }
function useTodos(sessions) { return useProjection(sessions, 'todos') }

// 读取当前会话是否 running（有会话在跑 = 工作中）。
function useRunning(sessions) {
  const subscribe = useCallback((cb) => (sessions && sessions.list ? sessions.list.subscribe(cb) : () => {}), [sessions])
  const getSnapshot = useCallback(() => {
    if (!sessions || !sessions.list) return false
    try {
      const snap = sessions.list.getSnapshot()
      const current = snap && snap.current
      if (!current) return false
      const row = (snap.items || []).find((r) => r.id === current)
      return !!(row && row.running)
    } catch {
      return false
    }
  }, [sessions])
  return useSyncExternalStore(subscribe, getSnapshot)
}

// 智子尺寸（可配置，默认 120）。
const DEFAULT_PET_SIZE = 64

// 皮肤属性：iris 虹膜三色 / pupil 瞳孔形状 / blood 血丝强度 / fierce 凶恶眼神 / aura 特效 / glow 光晕色。
// 爆款皮肤：原色（人眼）、深渊、宇宙死瞳、写轮眼、万花筒、轮回眼、三体智子、
//           白眼、血瞳、尸瞳、魔瞳（+ purple 兼容）。
const EYE_THEMES = {
  cyan: { iris: ['#8a5a3b', '#4a2e1a', '#160b06'], pupil: 'round', blood: 0.3, fierce: false, aura: 'none', glow: 'rgba(120,80,50,0.35)' },
  purple: { iris: ['#e9d5ff', '#9333ea', '#3b0764'], pupil: 'slit', blood: 0.45, fierce: true, aura: 'wraith', glow: 'rgba(168,85,247,0.6)' },
  void: { iris: ['#312e81', '#1e1b4b', '#030712'], pupil: 'ring', blood: 0.2, fierce: false, aura: 'abyss', glow: 'rgba(79,70,229,0.55)' },
  starfield: { iris: ['#4c1d95', '#312e81', '#0b0f14'], pupil: 'ring', blood: 0.15, fierce: false, aura: 'star', glow: 'rgba(139,92,246,0.6)' },
  sharingan: { iris: ['#ff8a8a', '#b91c1c', '#450a0a'], pupil: 'sharingan', blood: 0.5, fierce: true, aura: 'blood', glow: 'rgba(185,28,28,0.65)' },
  mangekyo: { iris: ['#fca5a5', '#7f1d1d', '#1c0000'], pupil: 'mangekyo', blood: 0.6, fierce: true, aura: 'blood', glow: 'rgba(127,29,29,0.65)' },
  rinnegan: { iris: ['#e9d5ff', '#a855f7', '#4c1d95'], pupil: 'rinnegan', blood: 0.2, fierce: false, aura: 'pale', glow: 'rgba(168,85,247,0.6)' },
  sophon: { iris: ['#cbd5e1', '#64748b', '#0f172a'], pupil: 'sophon', blood: 0.15, fierce: false, aura: 'star', glow: 'rgba(100,116,139,0.6)' },
  byakugan: { iris: ['#f5f3ff', '#c7d2fe', '#6366f1'], pupil: 'byakugan', blood: 0.4, fierce: true, aura: 'pale', glow: 'rgba(199,210,254,0.6)' },
  blood: { iris: ['#ff8a8a', '#dc2626', '#450a0a'], pupil: 'slit', blood: 1, fierce: true, aura: 'blood', glow: 'rgba(220,38,38,0.7)' },
  corpse: { iris: ['#d1d5db', '#9ca3af', '#374151'], pupil: 'round', blood: 0.1, fierce: false, aura: 'ash', glow: 'rgba(156,163,175,0.55)' },
  demon: { iris: ['#7f1d1d', '#450a0a', '#0a0000'], pupil: 'slit', blood: 0.7, fierce: true, aura: 'ember', glow: 'rgba(127,29,29,0.7)' },
}

// 皮肤展示顺序（菜单循环切换 / 设置页分段按钮）。
const SKIN_ORDER = ['cyan', 'void', 'starfield', 'sharingan', 'mangekyo', 'rinnegan', 'sophon', 'byakugan', 'blood', 'corpse', 'demon']

// 眼白血丝（放射状，从边缘向虹膜；按皮肤 blood 强度取前 N 条）。
const BLOOD_VESSELS = [
  'M 8 26 Q 20 22 30 26',
  'M 12 58 Q 24 64 34 60',
  'M 88 30 Q 76 24 66 30',
  'M 84 62 Q 72 68 62 64',
  'M 20 12 Q 24 22 30 28',
  'M 76 10 Q 72 22 66 30',
  'M 18 80 Q 26 72 32 64',
  'M 78 82 Q 70 72 64 64',
  'M 6 42 Q 16 46 24 46',
  'M 90 44 Q 80 48 72 46',
]

// 瞳孔形状：round 圆瞳 / slit 竖瞳（凶） / ring 异瞳（无底）/
//           sharingan 写轮眼 / mangekyo 万花筒 / rinnegan 轮回眼 / sophon 智子 / byakugan 白眼。
// 炸裂升级：勾玉、波纹、六边形、放射纹、异瞳环全部带旋转/脉冲动画。
function renderPupil(pupil, def) {
  if (pupil === 'slit') {
    return (
      <g style={{ transformOrigin: '48px 48px', animation: 'beast-vein-pulse 2s ease-in-out infinite' }}>
        <path d="M 48 29 C 52.5 38 52.5 58 48 67 C 43.5 58 43.5 38 48 29 Z" fill="#05060a" />
      </g>
    )
  }
  if (pupil === 'ring') {
    return (
      <React.Fragment>
        <circle cx="48" cy="48" r="12" fill="#05060a" />
        <g style={{ transformOrigin: '48px 48px', animation: 'beast-swirl-spin 5s linear infinite' }}>
          <circle cx="48" cy="48" r="18" fill="none" stroke={def.iris[2]} strokeWidth="2.5" opacity="0.85" strokeDasharray="14 6" />
        </g>
      </React.Fragment>
    )
  }
  if (pupil === 'sharingan' || pupil === 'mangekyo') {
    // 写轮眼 / 万花筒：黑瞳 + 三勾玉环绕旋转（万花筒勾玉更大）。
    const big = pupil === 'mangekyo'
    return (
      <React.Fragment>
        <circle cx="48" cy="48" r={big ? 8 : 9} fill="#05060a" />
        <g style={{ transformOrigin: '48px 48px', animation: `beast-swirl-spin ${big ? 4 : 3}s linear infinite` }}>
          {[0, 120, 240].map((a) => (
            <g key={a} transform={`rotate(${a}, 48, 48)`}>
              <circle cx="48" cy={big ? 25 : 27} r={big ? 5.5 : 4.2} fill="#05060a" />
              <path d={big ? 'M 43 29 L 53 29 L 48 41 Z' : 'M 44 31 L 52 31 L 48 40 Z'} fill="#05060a" />
            </g>
          ))}
        </g>
      </React.Fragment>
    )
  }
  if (pupil === 'rinnegan') {
    // 轮回眼：黑瞳 + 多层波纹同心圆（向外脉冲扩散）。
    return (
      <React.Fragment>
        <circle cx="48" cy="48" r="6" fill="#05060a" />
        {[11, 16, 21].map((r, i) => (
          <circle key={r} cx="48" cy="48" r={r} fill="none" stroke={def.iris[2]} strokeWidth="2" opacity="0.9"
            style={{ transformOrigin: '48px 48px', animation: `beast-halo-burst 3s ease-out ${i * 0.4}s infinite` }} />
        ))}
      </React.Fragment>
    )
  }
  if (pupil === 'sophon') {
    // 三体智子：黑瞳 + 六边形（质子）旋转 + 外环。
    return (
      <React.Fragment>
        <circle cx="48" cy="48" r="7" fill="#05060a" />
        <g style={{ transformOrigin: '48px 48px', animation: 'beast-swirl-spin 6s linear infinite' }}>
          <polygon points="48,24 68.8,36 68.8,60 48,72 27.2,60 27.2,36" fill="none" stroke="#94a3b8" strokeWidth="2" opacity="0.9" />
        </g>
        <circle cx="48" cy="48" r="21" fill="none" stroke="#94a3b8" strokeWidth="1.5" opacity="0.6"
          style={{ transformOrigin: '48px 48px', animation: 'beast-glow-pulse 2.5s ease-in-out infinite' }} />
      </React.Fragment>
    )
  }
  if (pupil === 'byakugan') {
    // 白眼：几乎无瞳孔（淡瞳）+ 放射状淡纹旋转。
    return (
      <React.Fragment>
        <circle cx="48" cy="48" r="6" fill="#e0e7ff" opacity="0.55" />
        <g style={{ transformOrigin: '48px 48px', animation: 'beast-swirl-spin 8s linear infinite' }}>
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <line key={a} x1="48" y1="28" x2="48" y2="40" stroke="#c7d2fe" strokeWidth="1.2" opacity="0.65" transform={`rotate(${a}, 48, 48)`} />
          ))}
        </g>
      </React.Fragment>
    )
  }
  return <circle cx="48" cy="48" r="12" fill="#05060a" />
}

// 钳制在 dsh 窗口内（不逃逸边界）。
function clampPos(x, y, size) {
  const w = window.innerWidth || 1200
  const h = window.innerHeight || 800
  return { x: Math.max(0, Math.min(x, w - size)), y: Math.max(0, Math.min(y, h - size)) }
}

// 垂直居中、偏右但留出余量（不贴右边缘）的默认位（未持久化时）。
function defaultPos(size) {
  try {
    const w = window.innerWidth || 1200
    const h = window.innerHeight || 800
    return clampPos(w - size - 96, Math.round(h / 2 - size / 2), size)
  } catch {
    return { x: 700, y: 300 }
  }
}

// ── 皮肤特效层（每种 aura 一组 SVG 动态元素，恐怖真实方向）────────────────
function AuraFx({ def }) {
  const glow = def.glow || 'rgba(255,255,255,0.5)'
  switch (def.aura) {
    case 'blood': // 血雾：血粒上升
      return (
        <g style={{ pointerEvents: 'none' }}>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={30 + i * 18} cy={86} r={3 + i} fill={glow} opacity="0.65"
              style={{ animation: `beast-rise 2.2s ease-out ${i * 0.45}s infinite` }} />
          ))}
        </g>
      )
    case 'ash': // 灰烬：灰粒飘落
      return (
        <g style={{ pointerEvents: 'none' }}>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={28 + i * 20} cy={14} r={2 + i} fill={glow} opacity="0.55"
              style={{ animation: `beast-ash-fall 2.6s ease-in ${i * 0.5}s infinite` }} />
          ))}
        </g>
      )
    case 'ember': // 熔火：上升火舌
    case 'rise':
      return (
        <g style={{ pointerEvents: 'none' }}>
          {[0, 1, 2].map((i) => (
            <ellipse key={i} cx={38 + i * 10} cy={88} rx={3.5} ry={7} fill={glow}
              style={{ transformOrigin: `${38 + i * 10}px 88px`, animation: `beast-rise 1.4s ease-out ${i * 0.25}s infinite` }} />
          ))}
        </g>
      )
    case 'wraith': // 幽灵缠绕：三条环绕光带
      return (
        <g style={{ pointerEvents: 'none' }}>
          <g style={{ transformOrigin: '48px 48px', animation: 'beast-wraith-spin 5s linear infinite' }}>
            <path d="M 48 6 A 42 42 0 0 1 90 48" stroke={glow} strokeWidth="4.5" fill="none" strokeLinecap="round" opacity="0.65" />
            <path d="M 48 90 A 42 42 0 0 1 6 48" stroke={glow} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
            <path d="M 6 48 A 42 42 0 0 1 48 90" stroke={glow} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.4" />
          </g>
        </g>
      )
    case 'spark': // 雷霆：密集闪光线
      return (
        <g style={{ pointerEvents: 'none' }}>
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M ${16 + i * 20} ${10 + i * 6} l 6 10 l -5 2 l 7 12 l -4 1 l 5 14`} stroke="#e0f2fe" strokeWidth="1.8" fill="none"
              style={{ animation: `beast-spark-flash 1s steps(1) ${i * 0.25}s infinite` }} />
          ))}
        </g>
      )
    case 'venom': // 毒液：密集上升气泡
    case 'bubbles':
      return (
        <g style={{ pointerEvents: 'none' }}>
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx={22 + i * 18} cy={82} r={2 + i} fill="none" stroke={glow} strokeWidth="1.6"
              style={{ animation: `beast-bubble-up 2s ease-in ${i * 0.4}s infinite` }} />
          ))}
        </g>
      )
    case 'abyss': // 深渊：旋转暗纹 + 吸积环
    case 'swirl':
      return (
        <g style={{ pointerEvents: 'none' }}>
          <g style={{ transformOrigin: '48px 48px', animation: 'beast-swirl-spin 4s linear infinite' }}>
            <path d="M 48 20 A 28 28 0 0 1 76 48" stroke={glow} strokeWidth="2.5" fill="none" opacity="0.6" />
            <path d="M 48 76 A 28 28 0 0 1 20 48" stroke={glow} strokeWidth="1.8" fill="none" opacity="0.45" />
            <path d="M 76 48 A 28 28 0 0 1 48 20" stroke={glow} strokeWidth="1.2" fill="none" opacity="0.35" />
          </g>
        </g>
      )
    case 'pale': // 苍白：扩散光晕
    case 'halo':
      return (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx="48" cy="48" r="30" fill="none" stroke={glow} strokeWidth="3"
            style={{ animation: 'beast-halo-burst 2.4s ease-out infinite' }} />
          <circle cx="48" cy="48" r="30" fill="none" stroke={glow} strokeWidth="3"
            style={{ animation: 'beast-halo-burst 2.4s ease-out 1.2s infinite' }} />
        </g>
      )
    case 'neon': // 荧光：闪烁描边
      return (
        <circle cx="48" cy="48" r="40" fill="none" stroke={glow} strokeWidth="2.5"
          style={{ pointerEvents: 'none', animation: 'beast-neon-flick 1.4s linear infinite' }} />
      )
    case 'star': // 星空：星点闪烁
    case 'crystal':
      return (
        <g style={{ pointerEvents: 'none' }}>
          {[[24, 26, 0], [70, 22, 0.5], [62, 66, 0.9], [30, 70, 0.3], [48, 82, 0.7]].map(([cx, cy, d], i) => (
            <circle key={i} cx={cx} cy={cy} r="2" fill="#ffffff"
              style={{ animation: `beast-star-twinkle 1.8s ease-in-out ${d}s infinite` }} />
          ))}
        </g>
      )
    case 'flame': // 烈焰：底部火苗舔舐（保留）
      return (
        <g style={{ pointerEvents: 'none' }}>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M ${36 + i * 12} 90 q -5 -18 0 -26 q 5 8 0 26`} fill={glow}
              style={{ transformOrigin: `${36 + i * 12}px 90px`, animation: `beast-flame-lick 0.7s ease-in-out ${i * 0.16}s infinite` }} />
          ))}
        </g>
      )
    case 'vein': // 血丝脉动环（保留）
      return (
        <circle cx="48" cy="48" r="40" fill="none" stroke={glow} strokeWidth="2.5"
          style={{ pointerEvents: 'none', transformOrigin: '48px 48px', animation: 'beast-vein-pulse 2.4s ease-in-out infinite' }} />
      )
    default:
      return null
  }
}

// ── 智子本体（程序化 SVG：透明背景纯眼球 + 命令式眼珠跟随 + 眨眼 / 浮动）──
function BeastMascot({ state, reacting, blinkLevel, size, theme, ghostPhase, aliveMode }) {
  const bob = state === 'sleep' ? 'beast-breathe-slow 4s' : state === 'work' ? 'beast-dance 0.9s' : 'beast-dance 2s'
  const irisTheme = EYE_THEMES[theme] || EYE_THEMES.cyan
  const lid = state === 'sleep' ? 1 : blinkLevel // 0=睁眼，1=闭眼
  const irisRef = useRef(null)
  const pupilRef = useRef(null)
  const bodyRef = useRef(null)
  const roamingRef = useRef(false)
  const [reduced, setReduced] = useState(false)

  // 命令式写三层视差 transform（眼球主体 / 虹膜 / 瞳孔）。
  const applyEye = useCallback((x, y) => {
    if (bodyRef.current) bodyRef.current.style.transform = `translate3d(${x * 0.22}px, ${y * 0.22}px, 0)`
    if (irisRef.current) irisRef.current.style.transform = `translate3d(${x * 0.5}px, ${y * 0.5}px, 0)`
    if (pupilRef.current) pupilRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }, [])

  // 系统「减少动效」：关闭装饰动画，进一步省资源。
  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      setReduced(mq.matches)
      const fn = () => setReduced(mq.matches)
      if (mq.addEventListener) mq.addEventListener('change', fn)
      return () => { if (mq.removeEventListener) mq.removeEventListener('change', fn) }
    } catch { return undefined }
  }, [])

  // 眼珠跟随鼠标：命令式改 DOM transform，绕过 React 渲染（零 re-render）。
  // 关键：translate3d + will-change 强制 GPU 合成层；缓存视口尺寸避免每帧读
  // window.innerWidth/innerHeight 触发 layout thrash；rAF 节流限到 60fps。
  useEffect(() => {
    if (state === 'sleep') return undefined
    let vw = window.innerWidth || 1200
    let vh = window.innerHeight || 800
    let raf = 0
    let pending = null
    const onResize = () => { vw = window.innerWidth || 1200; vh = window.innerHeight || 800 }
    const onMove = (e) => {
      if (roamingRef.current) return // 东张西望时不受鼠标控制
      const nx = (e.clientX / vw) * 2 - 1
      const ny = (e.clientY / vh) * 2 - 1
      pending = { x: nx * 14, y: ny * 14 }
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!pending) return
        const p = pending
        pending = null
        applyEye(p.x, p.y)
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [state, applyEye])

  // 眼球自由游走「找东西」（丝滑版）：rAF 逐帧 lerp 趋近随机目标，像鼠标跟随一样流畅。
  const startRoam = useCallback(() => {
    roamingRef.current = true
    let cur = { x: 0, y: 0 }
    let target = { x: (Math.random() * 2 - 1) * 14, y: (Math.random() * 2 - 1) * 14 }
    let raf = 0
    let lastSwitch = 0
    let stopTimer = null
    const step = (now) => {
      if (now - lastSwitch > 300 + Math.random() * 400) {
        target = { x: (Math.random() * 2 - 1) * 14, y: (Math.random() * 2 - 1) * 14 }
        lastSwitch = now
      }
      cur.x += (target.x - cur.x) * 0.25
      cur.y += (target.y - cur.y) * 0.25
      applyEye(cur.x, cur.y)
      if (Math.abs(target.x - cur.x) < 0.8 && Math.abs(target.y - cur.y) < 0.8) {
        target = { x: (Math.random() * 2 - 1) * 14, y: (Math.random() * 2 - 1) * 14 }
        lastSwitch = now
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    stopTimer = setTimeout(() => {
      cancelAnimationFrame(raf)
      roamingRef.current = false
      applyEye(0, 0)
    }, 3500)
    return () => {
      cancelAnimationFrame(raf)
      if (stopTimer) clearTimeout(stopTimer)
      roamingRef.current = false
    }
  }, [applyEye])

  // 初始化 100% 概率东张西望（1.5 秒后触发，不受鼠标控制；受活物开关管控）。
  useEffect(() => {
    if (!aliveMode || state === 'sleep') return undefined
    let stop = null
    const t = setTimeout(() => { stop = startRoam() }, 1500)
    return () => { clearTimeout(t); if (stop) stop() }
  }, [aliveMode, state, startRoam])

  // 幽灵「东张西望」：眼球自由游走（像在找东西，不受鼠标控制）。
  useEffect(() => {
    if (ghostPhase !== 'roam' || state === 'sleep') return undefined
    const stop = startRoam()
    return stop
  }, [ghostPhase, state, startRoam])

  const showFx = state !== 'sleep' && !reduced

  return (
    <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden="true"
      style={{ display: 'block', transform: reacting ? 'scale(1.1)' : 'scale(1)', transition: 'transform 0.18s ease', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }}>
      <defs>
        <clipPath id="beast-eye-clip">
          <circle cx="48" cy="48" r="44" />
        </clipPath>
        <radialGradient id="beast-sclera" cx="0.38" cy="0.32" r="1">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="0.55" stopColor="#e8edf2" />
          <stop offset="0.85" stopColor="#c2cdd6" />
          <stop offset="1" stopColor="#8b98a5" />
        </radialGradient>
        <radialGradient id="beast-iris" cx="0.4" cy="0.35" r="0.85">
          <stop offset="0" stopColor={irisTheme.iris[0]} />
          <stop offset="0.55" stopColor={irisTheme.iris[1]} />
          <stop offset="1" stopColor={irisTheme.iris[2]} />
        </radialGradient>
        <radialGradient id="beast-lid" cx="0.5" cy="0.12" r="1">
          <stop offset="0" stopColor="#3a2b5c" />
          <stop offset="0.6" stopColor="#241a3a" />
          <stop offset="1" stopColor="#140d20" />
        </radialGradient>
      </defs>
      {/* 主体（轻微浮动；减少动效时静止） */}
      <g style={{ transformOrigin: '48px 48px', animation: reduced ? 'none' : `${bob} ease-in-out infinite` }}>
        {/* 全部裁剪进眼球圆内 */}
        <g clipPath="url(#beast-eye-clip)">
          {/* 眼白（固定，不随视线移） */}
          <circle cx="48" cy="48" r="44" fill="url(#beast-sclera)" />
          {/* 血丝（恐怖，按 blood 强度取前 N 条） */}
          {BLOOD_VESSELS.slice(0, Math.round((irisTheme.blood || 0) * 10)).map((d, i) => (
            <path key={i} d={d} stroke="#d64545" strokeWidth="1.1" fill="none" opacity={0.35 + (irisTheme.blood || 0) * 0.4} />
          ))}
          {/* 眼球主体（虹膜+瞳孔+特效+高光）随视线位移（视差第一层） */}
          <g ref={bodyRef} style={{ willChange: 'transform' }}>
            <g ref={irisRef} style={{ willChange: 'transform' }}>
              <circle cx="48" cy="48" r="26" fill="url(#beast-iris)" />
            </g>
            <g ref={pupilRef} style={{ willChange: 'transform' }}>
              {renderPupil(irisTheme.pupil, irisTheme)}
            </g>
            {/* 皮肤光晕 + 特效层（休眠/减少动效时关闭）—— 精简：内脉冲 + 冲击波 + 瞳孔动画 */}
            {showFx && (
              <React.Fragment>
                <circle cx="48" cy="48" r="28" fill="none" stroke={irisTheme.glow} strokeWidth="3" opacity="0.7"
                  style={{ animation: 'beast-glow-pulse 1.5s ease-in-out infinite', pointerEvents: 'none' }} />
                <circle cx="48" cy="48" r="26" fill="none" stroke={irisTheme.glow} strokeWidth="2.5"
                  style={{ animation: 'beast-halo-burst 2.5s ease-out infinite', pointerEvents: 'none' }} />
              </React.Fragment>
            )}
            {showFx && <AuraFx def={irisTheme} />}
            {/* 高光（固定，3D 反光） */}
            <circle cx="33" cy="32" r="6" fill="#ffffff" opacity="0.95" />
            <circle cx="60" cy="58" r="3" fill="#ffffff" opacity="0.5" />
          </g>
          {/* 凶恶眼神：上眼睑内角下压的斜带（皱眉） */}
          {irisTheme.fierce && (
            <path d="M 6 42 L 90 30 L 90 40 L 6 52 Z" fill="rgba(20,13,32,0.55)" />
          )}
          {/* 眼皮：固定（不随眼球移），随 lid 平滑下滑（弧形睫毛线 + 褶皱） */}
          <g style={{ transform: `translateY(${-96 + lid * 96}px)`, transition: 'transform 0.12s ease-in-out' }}>
            <rect x="0" y="0" width="96" height="96" fill="url(#beast-lid)" />
            <path d="M 2 94 Q 48 84 94 94" stroke="#0d0818" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M 6 44 Q 48 52 90 44" stroke="#120c1e" strokeWidth="1.8" fill="none" opacity="0.55" />
          </g>
        </g>
      </g>
    </svg>
  )
}

// ── 悬浮智子 ────────────────────────────────────────────────────────────────
function BeastPet({ scope, sessions, t, inputBridge }) {
  const snap = useScope(scope)
  const value = snap && snap.value && typeof snap.value === 'object' ? snap.value : null
  const running = useRunning(sessions)
  const goalProj = useGoal(sessions)
  const todosProj = useTodos(sessions)
  const goal = goalProj && goalProj.goal ? goalProj.goal : null
  const todos = Array.isArray(todosProj) ? todosProj : []
  const size = value && typeof value.petSize === 'number' ? Math.max(48, Math.min(160, value.petSize)) : DEFAULT_PET_SIZE
  const theme = value && value.eyeTheme ? value.eyeTheme : 'cyan'
  const irisTheme = EYE_THEMES[theme] || EYE_THEMES.cyan
  const [pos, setPos] = useState(() => {
    const p = value && value.petPos
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? clampPos(p.x, p.y, size) : defaultPos(size)
  })
  const dragRef = useRef(null)
  const [reacting, setReacting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [blinkLevel, setBlinkLevel] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [burst, setBurst] = useState(0)
  const [ghostPhase, setGhostPhase] = useState(null) // null | blink | roam | rest
  const [greeting, setGreeting] = useState(null)
  const [progressOpen, setProgressOpen] = useState(false)

  const enabled = value ? value.enabled !== false : true
  const petEnabled = value ? value.petEnabled !== false : true
  const ghostMode = value ? value.ghostMode === true : false
  const ghostIdle = value && typeof value.ghostIdle === 'number' ? Math.max(3, Math.min(60, value.ghostIdle)) : 8
  const ghostRoam = value ? value.ghostRoam !== false : true
  const ghostBlink = value ? value.ghostBlink !== false : true
  const aliveMode = value ? value.aliveMode !== false : true
  const state = !enabled ? 'sleep' : running ? 'work' : 'idle'
  const title = state === 'sleep' ? t('petSleep') : state === 'work' ? t('petWorking') : t('petAwake')
  // 进度真实来源：任务步（todos）。done 计 1，in_progress 计 0.5，pending 0。
  // 无任务步时回退到 goal phase（complete=100）。
  const doneTodos = todos.filter((it) => it.status === 'completed').length
  const activeTodos = todos.filter((it) => it.status === 'in_progress').length
  const hasProgress = todos.length > 0 || goal != null
  const progressPct = todos.length > 0
    ? Math.round(((doneTodos + activeTodos * 0.5) / todos.length) * 100)
    : (goal ? (goal.phase === 'complete' ? 100 : 0) : 0)

  // 头顶常驻「进度 + 文字」：状态行 + 当前焦点行，跟 dsh 对话框的目标/计划同步。
  const currentStep = todos.find((it) => it.status === 'in_progress') || todos.find((it) => it.status === 'pending')
  const headStatus = todos.length > 0
    ? '📋 ' + doneTodos + '/' + todos.length + ' 步 · ' + progressPct + '%'
    : (goal ? '🎯 ' + goal.objective + ' · ' + progressPct + '%' : (running ? '🔄 智子 · 驭兽中' : '👁️ 智子 · 待命'))
  const headFocus = currentStep ? currentStep.content
    : (goal ? (goal.phase === 'complete' ? '目标已完成' : '目标：' + goal.objective) : '')

  // 初始化 40% 概率弹出「反人类」气泡（受活物开关管控，随机台词，几秒后消失）。
  useEffect(() => {
    if (!aliveMode) return undefined
    if (Math.random() >= 0.4) return undefined
    const keys = ['msg_1', 'msg_2', 'msg_3', 'msg_4', 'msg_5', 'msg_6', 'msg_7', 'msg_8']
    let hide = null
    const show = setTimeout(() => {
      setGreeting(t(keys[Math.floor(Math.random() * keys.length)]))
      hide = setTimeout(() => setGreeting(null), 5000)
    }, 1500)
    return () => { clearTimeout(show); if (hide) clearTimeout(hide) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aliveMode])

  // 随机眨眼（活物感；顺滑快速）。
  useEffect(() => {
    let closed
    const schedule = () => {
      closed = setTimeout(() => {
        setBlinkLevel(1)
        setTimeout(() => { setBlinkLevel(0); schedule() }, 200)
      }, 2000 + Math.random() * 4000)
    }
    schedule()
    return () => clearTimeout(closed)
  }, [])

  // 活物行为（独立于幽灵模式）：鼠标 n 秒无活动 → 加权随机动作
  // 闪现 80 / 东张西望 70 / 原地 50（总 200 → 40% / 35% / 25%）。
  useEffect(() => {
    if (!aliveMode || state !== 'idle') { setGhostPhase(null); return undefined }
    let timer = null
    const reset = () => {
      setGhostPhase(null)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        // 闪现 100%：空闲即闪现到随机点位
        setGhostPhase('blink')
      }, ghostIdle * 1000)
    }
    reset()
    window.addEventListener('mousemove', reset, { passive: true })
    window.addEventListener('mousedown', reset, { passive: true })
    window.addEventListener('keydown', reset, { passive: true })
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('mousemove', reset)
      window.removeEventListener('mousedown', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [aliveMode, state, ghostIdle])

  // 幽灵「跳闪」：闪现到远离当前位置的随机点位（最少短边 30% 位移，避免原地闪）。
  useEffect(() => {
    if (ghostPhase !== 'blink') return
    const w = window.innerWidth || 1200
    const h = window.innerHeight || 800
    const minDist = Math.min(w, h) * 0.3
    setPos((prev) => {
      let tx = prev.x
      let ty = prev.y
      for (let i = 0; i < 24; i++) {
        const nx = Math.random() * (w - size)
        const ny = Math.random() * (h - size)
        const dx = nx - prev.x
        const dy = ny - prev.y
        if (dx * dx + dy * dy >= minDist * minDist) { tx = nx; ty = ny; break }
      }
      return clampPos(tx, ty, size)
    })
  }, [ghostPhase, size])

  if (!petEnabled) return null

  // 长按拖拽：按住 280ms 后进入拖拽态；快速点按 = 弹出菜单。
  const onPointerDown = (e) => {
    const timer = setTimeout(() => { if (dragRef.current) dragRef.current.armed = true }, 280)
    dragRef.current = {
      startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y,
      moved: false, armed: false, timer,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d || !d.armed) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    setPos(clampPos(d.baseX + dx, d.baseY + dy, size))
  }
  const onPointerUp = () => {
    const d = dragRef.current
    if (!d) return
    clearTimeout(d.timer)
    const wasDrag = d.armed && d.moved
    dragRef.current = null
    if (wasDrag) {
      scope.set('petPos', pos)
    } else {
      setMenuOpen((v) => !v)
      setReacting(true)
      setBurst((b) => b + 1)
      setTimeout(() => setReacting(false), 400)
    }
  }

  const applyCommand = (text) => {
    if (inputBridge && typeof inputBridge.setDraft === 'function') {
      inputBridge.setDraft(text)
    } else if (inputBridge) {
      // 新会话（hero 无输入框）时 setDraft 尚未就绪：暂存，等 composer 挂载后自动填入。
      inputBridge.pending = text
    }
    setMenuOpen(false)
  }

  // 打开设置面板并直接切到「三体」分区（而非默认的通用）。
  const openSettings = () => {
    setMenuOpen(false)
    try {
      const trigger = document.querySelector('button[aria-haspopup="dialog"]')
      if (trigger) trigger.click()
      let tries = 0
      const timer = setInterval(() => {
        tries++
        const buttons = Array.from(document.querySelectorAll('nav button'))
        const target = buttons.find((b) => {
          const txt = (b.textContent || '')
          return txt.includes('三体') || txt.includes('Three-Body')
        })
        if (target) {
          target.click()
          clearInterval(timer)
        } else if (tries > 8) {
          clearInterval(timer)
        }
      }, 100)
    } catch {}
  }

  const petDiv = React.createElement(
    'div',
    {
      role: 'button',
      tabIndex: 0,
      title,
      'aria-label': title,
      onPointerDown, onPointerMove, onPointerUp,
      onMouseEnter: () => setHovering(true),
      onMouseLeave: () => setHovering(false),
      style: {
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 100000,
        width: size, height: size, cursor: 'grab', userSelect: 'none', touchAction: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        filter: state === 'sleep' ? 'grayscale(1) opacity(0.55)' : 'none',
        boxShadow: hovering || state === 'work' ? '0 0 0 2px rgba(245,158,11,0.35)' : 'none',
        transform: hovering ? 'scale(1.04)' : 'scale(1)',
        animation: ghostPhase === 'blink'
          ? 'beast-ghost-idle-blink 1.6s ease-in-out infinite'
          : ghostPhase === 'rest' ? 'beast-ghost-idle-rest 3s ease-in-out infinite' : 'none',
        transition: 'filter 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease',
      },
    },
    burst > 0 ? React.createElement('span', {
      key: 'burst-' + burst,
      style: {
        position: 'absolute', inset: -4, borderRadius: 18,
        border: '2px solid rgba(245,158,11,0.55)',
        animation: 'beast-ring 0.45s ease-out forwards', pointerEvents: 'none',
      },
    }) : null,
    theme !== 'cyan' ? React.createElement('div', {
      key: 'mist',
      style: {
        position: 'absolute', inset: -80, borderRadius: '50%',
        background: 'radial-gradient(circle, ' + (irisTheme.glow || 'rgba(255,255,255,0.4)') + ' 0%, transparent 55%)',
        filter: 'blur(36px)', pointerEvents: 'none',
        animation: 'beast-mist 5s ease-in-out infinite',
      },
    }) : null,
    React.createElement(BeastMascot, { state, reacting, blinkLevel, size, theme, ghostPhase, aliveMode }),
    React.createElement('div', {
      key: 'prog',
      onClick: (e) => { e.stopPropagation(); setProgressOpen(!progressOpen); },
      title: hasProgress ? '智子 · 驭兽中 · 任务进度 ' + progressPct + '%（点击展开）' : running ? '智子 · 驭兽中（点击查看）' : '智子 · 待命（点击查看）',
      style: { position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6, cursor: 'pointer', zIndex: 100002, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 'min(280px, calc(100vw - 24px))' },
    },
      React.createElement('div', {
        key: 'progtext',
        style: {
          pointerEvents: 'none', textAlign: 'center', maxWidth: 300,
          overflow: 'hidden',
        },
      },
        React.createElement('div', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11, fontWeight: 700, color: '#fde68a', lineHeight: 1.3, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '3px 8px' } }, headStatus),
        headFocus ? React.createElement('div', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 10, opacity: 0.85, color: '#f3f4f6', lineHeight: 1.3, marginTop: 2, maxWidth: 300, background: 'rgba(15,23,42,0.75)', borderRadius: 6, padding: '2px 6px' } }, headFocus) : null,
      ),
      React.createElement('div', { style: { height: 6, borderRadius: 3, background: 'rgba(120,120,120,0.25)', border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden', width: '100%' } },
        React.createElement('div', {
          style: {
            height: '100%', width: hasProgress ? progressPct + '%' : running ? '45%' : '0%',
            borderRadius: 3,
            background: 'linear-gradient(90deg,#f59e0b,#f43f5e,#f59e0b)',
            backgroundSize: '200% 100%',
            animation: running && !hasProgress ? 'beast-mist 1.4s linear infinite' : 'none',
            transition: 'width 0.4s ease',
          },
        }),
      ),
      progressOpen && React.createElement('div', {
        key: 'progbody',
        style: { marginTop: 6, background: 'rgba(15,23,42,0.92)', color: '#f3f4f6', borderRadius: 10, padding: '8px 10px', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', border: '1px solid rgba(245,158,11,0.3)', whiteSpace: 'normal', minWidth: 200, pointerEvents: 'none' },
      },
        React.createElement('div', { style: { fontWeight: 700, marginBottom: 6 } },
          todos.length > 0 ? '📋 任务步 · 已完成 ' + doneTodos + '/' + todos.length
            : (goal ? '🎯 目标中 · ' + goal.phase : (running ? '🔄 智子 · 驭兽中' : '👁️ 智子 · 待命'))),
        todos.length > 0 ? React.createElement('ul', { style: { fontSize: 12, lineHeight: 1.8, margin: '0 0 6px', paddingLeft: 6, listStyle: 'none' } },
          todos.map((it, idx) => React.createElement('li', {
            key: it.content,
            style: { opacity: it.status === 'completed' ? 0.55 : 1, textDecoration: it.status === 'completed' ? 'line-through' : 'none' },
          },
            (idx + 1) + '. ' + (it.status === 'completed' ? '✅ ' : it.status === 'in_progress' ? '▶ ' : '○ ') + it.content,
          )),
        ) : (goal ? React.createElement('div', { style: { fontSize: 12, opacity: 0.9, lineHeight: 1.6, marginBottom: 6 } },
          goal.objective,
          ' · 进度 ' + progressPct + '%',
        ) : null),
        React.createElement('div', { style: { fontSize: 11, opacity: 0.75, lineHeight: 1.7 } },
          '驯兽五步：① 问清 → ② 方案 → ③ 章程 → ④ 执行 → ⑤ 交付', React.createElement('br', null),
          '进度 = 任务步完成度（done 计 1 / in_progress 计 0.5）', React.createElement('br', null),
          '当前：' + (todos.length > 0 ? '执行中（内核已注入，进度条实时）' : goal ? '目标进行中' : running ? '执行中（内核已注入）' : '待命'),
        ),
      ),
    ),
    greeting ? React.createElement('div', {
      key: 'greet',
      style: {
        position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 34,
        background: 'rgba(15,23,42,0.92)', color: '#f3f4f6', borderRadius: 10, padding: '8px 12px',
        fontSize: 12, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        border: '1px solid rgba(245,158,11,0.3)', zIndex: 100002, maxWidth: 220,
        pointerEvents: 'none',
      },
    }, greeting) : null,
  )

  const menu = menuOpen ? React.createElement(
    'div',
    { key: 'menu', className: 'beast-menu', onClick: (e) => e.stopPropagation(), style: {
      position: 'fixed', left: Math.max(8, pos.x - 280), top: Math.min((window.innerHeight || 800) - 300, pos.y),
      zIndex: 100001, minWidth: 260, borderRadius: 14, overflow: 'hidden',
      background: 'linear-gradient(160deg, rgba(30,41,59,0.98), rgba(15,23,42,0.98))',
      color: '#f3f4f6', boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(245,158,11,0.28)', padding: 8,
    } },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' } },
      React.createElement('span', { style: { fontSize: 18, lineHeight: 1 } }, '👁️'),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 1 } },
        React.createElement('span', { style: { fontWeight: 700, fontSize: 13, letterSpacing: 0.5 } }, t('menuTitle')),
        React.createElement('span', { style: { fontSize: 11, opacity: 0.65 } }, state === 'sleep' ? t('petSleep') : t('petAwake')),
      ),
    ),
    React.createElement('button', { className: 'beast-menu-item', onClick: () => applyCommand('/tame ') },
      React.createElement('span', { style: { fontWeight: 700 } }, '⚔️ ' + t('menuTame')),
      React.createElement('span', { style: { fontSize: 11, opacity: 0.7 } }, t('menuTameDesc')),
    ),
    React.createElement('button', { className: 'beast-menu-item', onClick: () => applyCommand('帮我剖析需求，只出规范 markdown 计划、不执行：') },
      React.createElement('span', { style: { fontWeight: 600 } }, '🔍 ' + t('menuAnalyze')),
      React.createElement('span', { style: { fontSize: 11, opacity: 0.7 } }, t('menuAnalyzeDesc')),
    ),
    React.createElement('button', { className: 'beast-menu-item', onClick: () => applyCommand('帮我剖析：如何做一个更华丽、更有创意的 UI，只出规范 markdown 计划、不执行：') },
      React.createElement('span', { style: { fontWeight: 600 } }, '🎨 ' + t('menuDissectUI')),
      React.createElement('span', { style: { fontSize: 11, opacity: 0.7 } }, t('menuDissectUIDesc')),
    ),
    React.createElement('button', { className: 'beast-menu-item', onClick: () => applyCommand('帮我剖析：如何做一个高转化的营销官网，只出规范 markdown 计划、不执行：') },
      React.createElement('span', { style: { fontWeight: 600 } }, '🖥️ ' + t('menuDissectSite')),
      React.createElement('span', { style: { fontSize: 11, opacity: 0.7 } }, t('menuDissectSiteDesc')),
    ),
    React.createElement('button', { className: 'beast-menu-item', onClick: openSettings },
      React.createElement('span', { style: { fontWeight: 600 } }, '⚙️ ' + t('menuSettings')),
      React.createElement('span', { style: { fontSize: 11, opacity: 0.7 } }, t('menuSettingsDesc')),
    ),
    React.createElement('div', { style: { height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 8px' } }),
    React.createElement('button', { className: 'beast-menu-item', onClick: () => {
      const idx = SKIN_ORDER.indexOf(theme)
      const nextSkin = SKIN_ORDER[(idx + 1 + SKIN_ORDER.length) % SKIN_ORDER.length]
      scope.set('eyeTheme', nextSkin)
      setReacting(true)
      setTimeout(() => setReacting(false), 400)
    } },
      React.createElement('span', { style: { fontWeight: 600 } }, '🎭 ' + t('menuSkin') + ': ' + t('skin_' + theme)),
      React.createElement('span', { style: { fontSize: 11, opacity: 0.7 } }, t('menuSkinDesc').split('{{skin}}').join(t('skin_' + theme))),
    ),
    React.createElement('button', { className: 'beast-menu-item', onClick: () => { scope.set('enabled', !enabled); setMenuOpen(false) } },
      React.createElement('span', null, (enabled ? '💤 ' : '👁️ ') + (enabled ? t('menuToggleSleep') : t('menuToggleWake'))),
    ),
  ) : null

  const backdrop = menuOpen ? React.createElement('div', {
    key: 'backdrop', onClick: () => setMenuOpen(false),
    style: { position: 'fixed', inset: 0, zIndex: 99999, background: 'transparent' },
  }) : null

  return React.createElement(React.Fragment, null,
    React.createElement('style', { key: 'css' }, CSS),
    petDiv,
    backdrop,
    menu,
  )
}

// ── 设置页控件 ──────────────────────────────────────────────────────────────
function Row({ label, hint, checked, onChange }) {
  return React.createElement(
    'div',
    { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
      React.createElement('span', { style: { fontWeight: 600 } }, label),
      React.createElement('span', { style: { fontSize: 12, opacity: 0.6 } }, hint)),
    React.createElement('button', {
      onClick: () => onChange(!checked), 'aria-pressed': checked,
      style: {
        minWidth: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: checked ? '#10b981' : 'rgba(120,120,120,0.3)', position: 'relative', transition: 'background 0.2s ease',
      },
    }, React.createElement('span', {
      style: {
        position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff',
        left: checked ? 22 : 2, transition: 'left 0.2s ease',
      },
    })),
  )
}

function Seg({ value, options, onChange }) {
  return React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
    options.map(([v, label]) => React.createElement('button', {
      key: v, onClick: () => onChange(v), 'aria-pressed': value === v,
      style: {
        padding: '6px 12px', borderRadius: 8, border: '1px solid', cursor: 'pointer',
        borderColor: value === v ? '#10b981' : 'rgba(120,120,120,0.3)',
        background: value === v ? 'rgba(16,185,129,0.12)' : 'transparent',
        fontWeight: value === v ? 600 : 400,
      },
    }, label)),
  )
}

function Field(props, extraChildren) {
  const { label, children = extraChildren } = props ?? {}
  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    React.createElement('span', { style: { fontWeight: 600 } }, label),
    children)
}

function TextInput({ value, onChange, placeholder, hint }) {
  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    hint ? React.createElement('span', { style: { fontSize: 12, opacity: 0.6 } }, hint) : null,
    React.createElement('input', {
      value: value || '',
      onChange: (e) => onChange(e.target.value),
      placeholder,
      style: {
        width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
        border: '1px solid rgba(120,120,120,0.3)', background: 'transparent',
        fontFamily: 'inherit', fontSize: 13,
      },
    }),
  )
}

// ── 设置标签页 ──────────────────────────────────────────────────────────────
function BeastSettings({ useBeastSettings, t, scope }) {
  const snap = useBeastSettings((s) => s)
  const value = snap && snap.value && typeof snap.value === 'object' ? snap.value : null

  if (!value) return React.createElement('div', { style: { padding: 16, opacity: 0.6 } }, t('loading'))

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 20, padding: 16, maxWidth: 560 } },
    Row({ label: t('tField'), hint: t('tFieldHint'), checked: value.enabled !== false, onChange: (v) => scope.set('enabled', v) }),
    Row({ label: t('tAiMode'), hint: t('tAiModeHint'), checked: value.aiMode === true, onChange: (v) => scope.set('aiMode', v) }),
    Row({ label: t('tPet'), hint: t('tPetHint'), checked: value.petEnabled !== false, onChange: (v) => scope.set('petEnabled', v) }),
    Field({ label: t('tPetSize') }, Seg({
      value: value.petSize || 64, onChange: (v) => scope.set('petSize', v),
      options: [[48, t('sizeNano')], [64, t('sizeTiny')], [96, t('sizeSmall')], [120, t('sizeMedium')], [160, t('sizeLarge')]],
    })),
    Field({ label: t('tEyeTheme') }, Seg({
      value: value.eyeTheme || 'cyan', onChange: (v) => scope.set('eyeTheme', v),
      options: SKIN_ORDER.map((k) => [k, t('skin_' + k)]),
    })),
    Row({ label: t('tAliveMode'), hint: t('tAliveModeHint'), checked: value.aliveMode !== false, onChange: (v) => scope.set('aliveMode', v) }),
    Row({ label: t('tGhostMode'), hint: t('tGhostModeHint'), checked: value.ghostMode === true, onChange: (v) => scope.set('ghostMode', v) }),
    Field({ label: t('tGhostIdle') }, TextInput({
      value: String(value.ghostIdle || 8),
      onChange: (v) => { const n = parseInt(v, 10); if (!isNaN(n)) scope.set('ghostIdle', Math.max(3, Math.min(60, n))) },
      placeholder: '8', hint: t('tGhostIdleHint'),
    })),
    Row({ label: t('tGhostRoam'), hint: t('tGhostRoamHint'), checked: value.ghostRoam !== false, onChange: (v) => scope.set('ghostRoam', v) }),
    Row({ label: t('tGhostBlink'), hint: t('tGhostBlinkHint'), checked: value.ghostBlink !== false, onChange: (v) => scope.set('ghostBlink', v) }),
    Field({ label: t('tMode') }, Seg({
      value: value.mode || 'balanced', onChange: (v) => scope.set('mode', v),
      options: [['minimal', t('modeMinimal')], ['balanced', t('modeBalanced')], ['full', t('modeFull')]],
    })),
    Field({ label: t('tLang') }, Seg({
      value: value.lang || 'zh', onChange: (v) => scope.set('lang', v),
      options: [['zh', t('langZh')], ['en', t('langEn')]],
    })),
    Field({ label: t('tTone') }, Seg({
      value: value.tone || 'arrogant', onChange: (v) => scope.set('tone', v),
      options: [['arrogant', t('toneArrogant')], ['gentle', t('toneGentle')], ['warm', t('toneWarm')]],
    })),
    Field({ label: t('tSelf') }, TextInput({
      value: value.selfName, onChange: (v) => scope.set('selfName', v),
      placeholder: '本尊', hint: t('tSelfHint'),
    })),
    Field({ label: t('tMaster') }, TextInput({
      value: value.userTitle, onChange: (v) => scope.set('userTitle', v),
      placeholder: '主上', hint: t('tMasterHint'),
    })),
    Row({ label: t('tAnalyze'), hint: t('tAnalyzeHint'), checked: value.analyzeTool === true, onChange: (v) => scope.set('analyzeTool', v) }),
    Field({ label: t('tOverride'), children: [
      React.createElement('span', { key: 'h', style: { fontSize: 12, opacity: 0.6 } }, t('tOverrideHint')),
      React.createElement('textarea', {
        key: 'ta', value: value.kernelOverride || '',
        onChange: (e) => scope.set('kernelOverride', e.target.value),
        rows: 6, placeholder: t('overridePlaceholder'),
        style: {
          width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8,
          border: '1px solid rgba(120,120,120,0.3)', background: 'transparent',
          fontFamily: 'inherit', fontSize: 13, resize: 'vertical',
        },
      }),
    ] }),
  )
}

// ── 首次唤醒弹窗（首次使用时，让用户定下语气/自称/称呼等规矩）────────────
function FirstRunModal({ scope, t }) {
  const snap = useScope(scope)
  const value = snap && snap.value && typeof snap.value === 'object' ? snap.value : null
  const [tone, setTone] = useState('arrogant')
  const [selfName, setSelfName] = useState('本尊')
  const [userTitle, setUserTitle] = useState('主上')
  const [lang, setLang] = useState('zh')
  const [mode, setMode] = useState('balanced')
  const [init, setInit] = useState(false)

  useEffect(() => {
    if (value && !init) {
      setTone(value.tone || 'arrogant')
      setSelfName(value.selfName || '本尊')
      setUserTitle(value.userTitle || '主上')
      setLang(value.lang || 'zh')
      setMode(value.mode || 'balanced')
      setInit(true)
    }
  }, [value, init])

  if (!value || value.onboarded !== false) return null

  const finish = (useDefaults) => {
    if (!useDefaults) {
      scope.set('tone', tone)
      scope.set('selfName', (selfName || '').trim() || '本尊')
      scope.set('userTitle', (userTitle || '').trim() || '主上')
      scope.set('lang', lang)
      scope.set('mode', mode)
    }
    scope.set('onboarded', true)
  }

  return React.createElement('div', {
    style: { position: 'fixed', inset: 0, zIndex: 200000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  },
    React.createElement('div', {
      style: { background: 'rgba(17,24,39,0.96)', color: '#f3f4f6', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' },
    },
      React.createElement('div', { style: { fontSize: 18, fontWeight: 700, marginBottom: 4 } }, t('obTitle')),
      React.createElement('div', { style: { fontSize: 13, opacity: 0.7, marginBottom: 20 } }, t('obIntro')),
      Field({ label: t('obTone') }, Seg({ value: tone, onChange: setTone, options: [['arrogant', t('toneArrogant')], ['gentle', t('toneGentle')], ['warm', t('toneWarm')]] })),
      Field({ label: t('obSelf') }, TextInput({ value: selfName, onChange: setSelfName, placeholder: '本尊' })),
      Field({ label: t('obMaster') }, TextInput({ value: userTitle, onChange: setUserTitle, placeholder: '主上' })),
      Field({ label: t('obLang') }, Seg({ value: lang, onChange: setLang, options: [['zh', t('langZh')], ['en', t('langEn')]] })),
      Field({ label: t('obMode') }, Seg({ value: mode, onChange: setMode, options: [['minimal', t('modeMinimal')], ['balanced', t('modeBalanced')], ['full', t('modeFull')]] })),
      React.createElement('div', { style: { display: 'flex', gap: 10, marginTop: 24 } },
        React.createElement('button', { onClick: () => finish(false), style: { flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, cursor: 'pointer' } }, t('obStart')),
        React.createElement('button', { onClick: () => finish(true), style: { padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#f3f4f6', cursor: 'pointer' } }, t('obSkip')),
      ),
    ),
  )
}

// ── 输入桥接（session 作用域空组件）：把当前会话的 setDraft 引给 root 层萌宠 ──
function InputBridge({ inputActions, inputBridge }) {
  useEffect(() => {
    const fn = (text) => inputActions.setDraft(text)
    inputBridge.setDraft = fn
    // 新会话期间暂存的命令：composer 就绪后立即填入。
    if (inputBridge.pending != null) {
      const p = inputBridge.pending
      inputBridge.pending = null
      fn(p)
    }
    return () => { if (inputBridge.setDraft === fn) inputBridge.setDraft = null }
  }, [inputActions, inputBridge])
  return null
}

// ── apply ───────────────────────────────────────────────────────────────────
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'beast-tamer: locale dictionaries')
  const t = ctx.locale.bind(NS)

  // 绑定一次设置命名空间 scope（稳定引用），萌宠与设置页共享同一份快照。
  const scope = ctx.settingsScope.bind({ namespace: NS })
  // 可写桥：InputBridge 会把当前会话的 inputActions.setDraft 存到这里，供萌宠菜单「应用到输入框」。
  const inputBridge = { setDraft: null, pending: null }
  const petInject = { scope, sessions: ctx.sessions, t, inputBridge }
  const settingsInject = { scope, t }
  const onboardInject = { scope, t }

  // 首次唤醒弹窗（order 高于萌宠；onboarded=false 时盖全屏，完成即收起）。
  ctx.effect(
    () => ctx.slots.inject('shell.overlay', function* () {
      yield ctx.slots.register(
        { name: 'shell.overlay', id: 'beast-tamer-onboard', order: 100, inject: () => onboardInject },
        FirstRunModal,
      )
    }),
    'beast-tamer: first-run onboarding',
  )

  // 悬浮智子（root 层 frame 级浮层，高于各列、不遮挡按钮）。
  ctx.effect(
    () => ctx.slots.inject('shell.overlay', function* () {
      yield ctx.slots.register(
        { name: 'shell.overlay', id: 'beast-tamer-pet', order: 0, inject: () => petInject },
        BeastPet,
      )
    }),
    'beast-tamer: floating pet',
  )

  // 设置面板顶层「三体」分区（与「插件」同层；locale 提供 t，hooks 提供 useBeastSettings）。
  ctx.effect(
    () => ctx.slots.inject('settings.section', () => ctx.slots.register(
      { name: 'settings.section', id: 'beast-tamer', order: 20, label: () => t('nav'), locale: NS, inject: () => ({ hooks: { beastSettings: scope }, scope }) },
      BeastSettings,
    )),
    'beast-tamer: settings section',
  )

  // 输入桥接（session 作用域空组件）：把 inputActions.setDraft 引给萌宠菜单。
  // 挂 conversation.input.left（blank 新会话 zone 存在即渲染，区别于 dock 在 hero 时不渲染）。
  ctx.effect(
    () => ctx.slots.inject('conversation.input.left', function* () {
      yield ctx.slots.register(
        { name: 'conversation.input.left', id: 'beast-tamer-input-bridge', inject: () => ({ inputBridge }) },
        InputBridge,
      )
    }),
    'beast-tamer: input bridge',
  )
}
