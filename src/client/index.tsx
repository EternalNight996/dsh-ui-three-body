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
  tField: '三体（内核开智）',
  tFieldHint: '开启后，每次对话注入智子内核，让智能体更懂你。',
  tPet: '悬浮智子',
  tPetHint: '右侧显示智子，点击开关内核、长按拖拽。',
  tPetSize: '智子尺寸',
  sizeSmall: '小',
  sizeMedium: '中（默认）',
  sizeLarge: '大',
  tEyeTheme: '眼睛皮肤主题',
  themeCyan: '青蓝',
  themeRed: '血红',
  themeGreen: '毒绿',
  themePurple: '魅紫',
  themeAmber: '琥珀',
  themeGlow: '荧光（脉冲）',
  themeFlame: '烈焰（闪烁）',
  themeStorm: '雷霆（闪烁）',
  themeVoid: '深渊（脉冲）',
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
  menuToggleSleep: '休眠',
  menuToggleWake: '唤醒',
}
const EN = {
  nav: 'Three-Body',
  petAwake: 'Sophon: awake (click to sleep, long-press to drag)',
  petSleep: 'Sophon: asleep (click to wake)',
  petWorking: 'Sophon: taming…',
  loading: 'Loading…',
  tField: 'Three-Body (kernel)',
  tFieldHint: 'Inject the Sophon kernel into every turn to make the agent understand you.',
  tPet: 'Floating Sophon',
  tPetHint: 'Show the Sophon; click to toggle the kernel, long-press to drag.',
  tPetSize: 'Sophon size',
  sizeSmall: 'Small',
  sizeMedium: 'Medium (default)',
  sizeLarge: 'Large',
  tEyeTheme: 'Eye theme',
  themeCyan: 'Cyan',
  themeRed: 'Blood red',
  themeGreen: 'Toxic green',
  themePurple: 'Arcane purple',
  themeAmber: 'Amber',
  themeGlow: 'Glow (pulse)',
  themeFlame: 'Flame (flicker)',
  themeStorm: 'Storm (flicker)',
  themeVoid: 'Void (pulse)',
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
  menuToggleSleep: 'Sleep',
  menuToggleWake: 'Wake',
}

// zustand 式快照 scope → useSyncExternalStore 稳定订阅。
function useScope(scope) {
  const subscribe = useCallback((cb) => (scope && typeof scope.subscribe === 'function' ? scope.subscribe(cb) : () => {}), [scope])
  const getSnapshot = useCallback(() => (scope && typeof scope.getSnapshot === 'function' ? scope.getSnapshot() : null), [scope])
  return useSyncExternalStore(subscribe, getSnapshot)
}

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
const DEFAULT_PET_SIZE = 120

// 眼睛皮肤主题：虹膜渐变三色（高光 → 中间 → 边缘）+ 可选特效（effect / glow 光环）。
const EYE_THEMES = {
  cyan: { iris: ['#7ff0ff', '#0ea5c4', '#0c4a6e'] },
  red: { iris: ['#ff9e9e', '#dc2626', '#4a0a0a'] },
  green: { iris: ['#a6ff9e', '#16a34a', '#0a3d1a'] },
  purple: { iris: ['#e4aaff', '#9333ea', '#3b0a6e'] },
  amber: { iris: ['#ffe29e', '#d97706', '#5b2a0a'] },
  glow: { iris: ['#7ff0ff', '#0ea5c4', '#0c4a6e'], effect: 'pulse', glow: 'rgba(34,211,238,0.6)' },
  flame: { iris: ['#ffd29e', '#f97316', '#7c2d12'], effect: 'flicker', glow: 'rgba(251,146,60,0.6)' },
  storm: { iris: ['#c4b5fd', '#7c3aed', '#2e1065'], effect: 'flicker', glow: 'rgba(167,139,250,0.55)' },
  void: { iris: ['#6b7280', '#1f2937', '#0b0f14'], effect: 'pulse', glow: 'rgba(148,163,184,0.45)' },
}

// 钳制在 dsh 窗口内（不逃逸边界）。
function clampPos(x, y, size) {
  const w = window.innerWidth || 1200
  const h = window.innerHeight || 800
  return { x: Math.max(0, Math.min(x, w - size)), y: Math.max(0, Math.min(y, h - size)) }
}

// 最右侧垂直居中默认位（未持久化时）。
function defaultPos(size) {
  try {
    return clampPos((window.innerWidth || 1200) - size - 12, Math.round((window.innerHeight || 800) / 2 - size / 2), size)
  } catch {
    return { x: 700, y: 300 }
  }
}

// ── 智子本体（程序化 SVG：纯 3D 大眼球 + 眼珠跟随鼠标 + 顺滑眨眼 / 轻微浮动）──
function BeastMascot({ state, reacting, blinkLevel, eye, size, theme }) {
  const bob = state === 'sleep' ? 'beast-breathe-slow 4s' : state === 'work' ? 'beast-dance 0.9s' : 'beast-dance 2s'
  const irisTheme = EYE_THEMES[theme] || EYE_THEMES.cyan
  const lid = state === 'sleep' ? 1 : blinkLevel // 0=睁眼，1=闭眼

  return (
    <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden="true"
      style={{ display: 'block', transform: reacting ? 'scale(1.1)' : 'scale(1)', transition: 'transform 0.18s ease', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }}>
      <defs>
        <clipPath id="beast-eye-clip">
          <circle cx="48" cy="48" r="44" />
        </clipPath>
        <radialGradient id="beast-sclera" cx="0.38" cy="0.32" r="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#eef2f6" />
          <stop offset="0.85" stopColor="#b6c2cf" />
          <stop offset="1" stopColor="#7d8ca0" />
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
      {/* 主体（轻微浮动） */}
      <g style={{ transformOrigin: '48px 48px', animation: `${bob} ease-in-out infinite` }}>
        {/* 全部裁剪进眼球圆内 */}
        <g clipPath="url(#beast-eye-clip)">
          {/* 眼白（3D 球体） */}
          <circle cx="48" cy="48" r="44" fill="url(#beast-sclera)" />
          {/* 血丝（恐怖） */}
          <path d="M 10 30 Q 24 22 34 26" stroke="#e05252" strokeWidth="1.1" fill="none" opacity="0.45" />
          <path d="M 16 62 Q 30 70 40 66" stroke="#e05252" strokeWidth="1.1" fill="none" opacity="0.45" />
          <path d="M 86 34 Q 72 26 62 30" stroke="#e05252" strokeWidth="1.1" fill="none" opacity="0.45" />
          <path d="M 80 58 Q 68 66 58 62" stroke="#e05252" strokeWidth="1.1" fill="none" opacity="0.4" />
          {/* 虹膜 + 瞳孔：transform 平移（GPU 加速，即时跟手） */}
          <g style={{ transform: `translate(${eye.x * 0.5}px, ${eye.y * 0.5}px)` }}>
            <circle cx="48" cy="48" r="26" fill="url(#beast-iris)" />
          </g>
          <g style={{ transform: `translate(${eye.x}px, ${eye.y}px)` }}>
            <circle cx="48" cy="48" r="13" fill="#05060a" />
          </g>
          {irisTheme.effect && (
            <circle cx="48" cy="48" r="31" fill="none" stroke={irisTheme.glow} strokeWidth="3"
              style={{ animation: `beast-glow-${irisTheme.effect} 2s ease-in-out infinite`, pointerEvents: 'none' }} />
          )}
          {/* 高光（固定，3D 反光） */}
          <circle cx="33" cy="32" r="7" fill="#ffffff" opacity="0.95" />
          <circle cx="62" cy="63" r="3.5" fill="#ffffff" opacity="0.5" />
          {/* 眼皮：随 lid 平滑下滑（弧形睫毛线 + 褶皱） */}
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
  const size = value && typeof value.petSize === 'number' ? Math.max(48, Math.min(160, value.petSize)) : DEFAULT_PET_SIZE
  const theme = value && value.eyeTheme ? value.eyeTheme : 'cyan'
  const [pos, setPos] = useState(() => {
    const p = value && value.petPos
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? clampPos(p.x, p.y, size) : defaultPos(size)
  })
  const dragRef = useRef(null)
  const [reacting, setReacting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [blinkLevel, setBlinkLevel] = useState(0)
  const [eye, setEye] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)
  const [burst, setBurst] = useState(0)

  const enabled = value ? value.enabled !== false : true
  const petEnabled = value ? value.petEnabled !== false : true
  const state = !enabled ? 'sleep' : running ? 'work' : 'idle'
  const title = state === 'sleep' ? t('petSleep') : state === 'work' ? t('petWorking') : t('petAwake')

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

  // 眼睛跟随鼠标（休眠时不跟随；rAF 节流 + 即时跟手，幅度大、不卡顿）。
  useEffect(() => {
    if (state === 'sleep') return undefined
    let raf = 0
    let pending = null
    const onMove = (e) => {
      const nx = (e.clientX / (window.innerWidth || 1)) * 2 - 1
      const ny = (e.clientY / (window.innerHeight || 1)) * 2 - 1
      pending = { x: nx * 14, y: ny * 14 }
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (pending) { setEye(pending); pending = null }
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf) }
  }, [state])

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
    if (inputBridge && typeof inputBridge.setDraft === 'function') inputBridge.setDraft(text)
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
        borderRadius: 20,
        background: hovering
          ? 'rgba(245,158,11,0.20)'
          : state === 'work' ? 'rgba(251,146,60,0.14)' : 'rgba(34,34,34,0.05)',
        filter: state === 'sleep' ? 'grayscale(1) opacity(0.55)' : 'none',
        boxShadow: hovering || state === 'work' ? '0 0 0 2px rgba(245,158,11,0.35)' : 'none',
        transform: hovering ? 'scale(1.04)' : 'scale(1)',
        transition: 'filter 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease',
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
    React.createElement(BeastMascot, { state, reacting, blinkLevel, eye, size, theme }),
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

function Field({ label, children }) {
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
function BeastSettings({ useBeastSettings, t }) {
  const snap = useBeastSettings((s) => s)
  const value = snap && snap.value && typeof snap.value === 'object' ? snap.value : null

  if (!value) return React.createElement('div', { style: { padding: 16, opacity: 0.6 } }, t('loading'))

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 20, padding: 16, maxWidth: 560 } },
    Row({ label: t('tField'), hint: t('tFieldHint'), checked: value.enabled !== false, onChange: (v) => scope.set('enabled', v) }),
    Row({ label: t('tPet'), hint: t('tPetHint'), checked: value.petEnabled !== false, onChange: (v) => scope.set('petEnabled', v) }),
    Field({ label: t('tPetSize') }, Seg({
      value: value.petSize || 120, onChange: (v) => scope.set('petSize', v),
      options: [[96, t('sizeSmall')], [120, t('sizeMedium')], [160, t('sizeLarge')]],
    })),
    Field({ label: t('tEyeTheme') }, Seg({
      value: value.eyeTheme || 'cyan', onChange: (v) => scope.set('eyeTheme', v),
      options: [['cyan', t('themeCyan')], ['red', t('themeRed')], ['green', t('themeGreen')], ['purple', t('themePurple')], ['amber', t('themeAmber')], ['glow', t('themeGlow')], ['flame', t('themeFlame')], ['storm', t('themeStorm')], ['void', t('themeVoid')]],
    })),
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
  const inputBridge = { setDraft: null }
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
      { name: 'settings.section', id: 'beast-tamer', order: 20, label: () => t('nav'), locale: NS, inject: () => ({ hooks: { beastSettings: scope } }) },
      BeastSettings,
    )),
    'beast-tamer: settings section',
  )

  // 输入桥接（session 作用域空组件）：把 inputActions.setDraft 引给萌宠菜单。
  ctx.effect(
    () => ctx.slots.inject('conversation.composer.dock', function* () {
      yield ctx.slots.register(
        { name: 'conversation.composer.dock', id: 'beast-tamer-input-bridge', inject: () => ({ inputBridge }) },
        InputBridge,
      )
    }),
    'beast-tamer: input bridge',
  )
}
