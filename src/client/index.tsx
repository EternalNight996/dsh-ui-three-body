// 驯兽师（client 侧）：悬浮萌宠 + 设置页。
//
// - `shell.overlay`：悬浮萌宠（默认右侧中间、长按拖拽、点击开关、情绪态：休眠/待命/工作中）。
// - `settings.plugins.tab`：设置面板「插件」里的「驯兽场」标签页，配置内核与开关。
//
// 通过 `settingsScope` 读写 host 侧的 `beast-tamer` 设置命名空间（持久化到 settings 文件）；
// 通过 `locale` 做中英双语；通过 `sessions` 读取当前会话 running 状态驱动情绪态。

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

const NS = 'beast-tamer'

// 程序化动画关键帧（内联注入，零依赖；替代 Lottie）。
const CSS = `
@keyframes beast-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.03); } }
@keyframes beast-breathe-slow { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
@keyframes beast-breathe-fast { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
@keyframes beast-tail { 0%,100% { transform: rotate(-5deg); } 50% { transform: rotate(8deg); } }
`

// settingsScope.bind 内部会 ctx.get('connection') / ctx.get('remote')，
// sessions 提供当前会话 running 信号；locale 提供中英双语。
export const inject = ['settingsScope', 'slots', 'connection', 'remote', 'sessions', 'locale']

// 中英词典（locale 命名空间）。键扁平，zh 兜底 + 缺失回退到键本身。
const ZH = {
  nav: '驯兽场',
  petAwake: '驯兽师：开智中（点击休眠，长按拖拽）',
  petSleep: '驯兽师：已休眠（点击唤醒）',
  petWorking: '驯兽师：正在驭兽…',
  loading: '加载中…',
  tField: '驯兽场（内核开智）',
  tFieldHint: '开启后，每次对话注入驯兽师内核，让智能体更懂你。',
  tPet: '悬浮萌宠',
  tPetHint: '右侧显示驯兽师萌宠，点击开关内核、长按拖拽。',
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
  tSelfHint: '驯兽师如何自称（本尊 / 我 / 在下…）',
  tMaster: '称呼你',
  tMasterHint: '驯兽师如何称呼你（主上 / 你 / 大人…）',
  tAnalyze: '需求剖析工具 beast_analyze',
  tAnalyzeHint: '开启后可用工具一键生成规范 markdown 计划（每次多一次模型调用）。',
  tOverride: '内核覆盖（可选）',
  tOverrideHint: '留空使用上方档位的内核；粘贴自定义文本则优先使用。',
  overridePlaceholder: '在此粘贴自定义驯兽师内核…',
  obTitle: '驯兽师 · 首次唤醒',
  obIntro: '本尊苏醒前，先听主上定下规矩。',
  obTone: '语气',
  obSelf: '自称',
  obMaster: '如何称呼你',
  obLang: '内核语言',
  obMode: '内核档位',
  obStart: '开始驯兽',
  obSkip: '先用默认',
  menuTame: '/tame',
  menuTameDesc: '触发驯兽四式：剖析→定靶→呈策→驭兽',
  menuToggleSleep: '休眠',
  menuToggleWake: '唤醒',
}
const EN = {
  nav: 'Beast Ground',
  petAwake: 'Beast Tamer: awake (click to sleep, long-press to drag)',
  petSleep: 'Beast Tamer: asleep (click to wake)',
  petWorking: 'Beast Tamer: taming…',
  loading: 'Loading…',
  tField: 'Beast Ground (kernel)',
  tFieldHint: 'Inject the Beast Tamer kernel into every turn to make the agent understand you.',
  tPet: 'Floating pet',
  tPetHint: 'Show the pet; click to toggle the kernel, long-press to drag.',
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
  tSelfHint: 'How the Tamer refers to itself (this one / I / ...)',
  tMaster: 'Your title',
  tMasterHint: 'How the Tamer addresses you (Master / you / ...)',
  tAnalyze: 'beast_analyze tool',
  tAnalyzeHint: 'Generate a canonical markdown plan in one tool call (costs one extra model call each time).',
  tOverride: 'Kernel override (optional)',
  tOverrideHint: 'Empty uses the level above; pasted text takes priority.',
  overridePlaceholder: 'Paste your custom Beast Tamer kernel…',
  obTitle: 'Beast Tamer · First Awakening',
  obIntro: 'Before I wake, set the rules, Master.',
  obTone: 'Tone',
  obSelf: 'Self-name',
  obMaster: 'How to address you',
  obLang: 'Kernel language',
  obMode: 'Kernel level',
  obStart: 'Begin taming',
  obSkip: 'Use defaults',
  menuTame: '/tame',
  menuTameDesc: 'Run the Four Maneuvers: dissect → target → plan → tame',
  menuToggleSleep: 'Sleep',
  menuToggleWake: 'Wake',
}

// zustand 式快照 scope → useSyncExternalStore 稳定订阅。
function useScope(scope) {
  const subscribe = useCallback((cb) => scope.subscribe(cb), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
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

// 右侧中间默认位（未持久化时）。x 右偏 76px，y 屏高一半。
function defaultPos() {
  try {
    const w = window.innerWidth || 1200
    const h = window.innerHeight || 800
    return { x: Math.max(8, w - 76), y: Math.max(8, Math.round(h / 2 - 26)) }
  } catch {
    return { x: 700, y: 300 }
  }
}

// 菜单项统一样式。
const menuItemStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
  border: 'none', background: 'transparent', color: '#f3f4f6', cursor: 'pointer', fontSize: 13,
}

// ── 萌宠本体（程序化 SVG：呼吸 / 眨眼 / 尾巴 / 眼睛跟随鼠标）──────────────
function BeastMascot({ state, reacting, blink, eye }) {
  const breathing = state === 'sleep' ? 'beast-breathe-slow 3.6s' : state === 'work' ? 'beast-breathe-fast 0.9s' : 'beast-breathe 2.4s'
  const tailSpeed = state === 'work' ? '1.1s' : state === 'sleep' ? '4s' : '2.6s'
  const eyesClosed = blink || state === 'sleep'

  return React.createElement('svg', {
    viewBox: '0 0 96 96', width: 48, height: 48, 'aria-hidden': true,
    style: { display: 'block', transform: reacting ? 'scale(1.18)' : 'scale(1)', transition: 'transform 0.18s ease' },
  },
    React.createElement('g', { style: { transformOrigin: '68px 66px', animation: `beast-tail ${tailSpeed} ease-in-out infinite` } },
      React.createElement('path', { d: 'M 68 66 C 83 58 91 70 82 80', fill: 'none', stroke: '#F59E0B', strokeWidth: 7, strokeLinecap: 'round' }),
    ),
    React.createElement('g', { style: { transformOrigin: '48px 52px', animation: `${breathing} ease-in-out infinite` } },
      React.createElement('path', { d: 'M 26 28 L 21 11 L 38 21 Z', fill: '#F59E0B' }),
      React.createElement('path', { d: 'M 70 28 L 75 11 L 58 21 Z', fill: '#F59E0B' }),
      React.createElement('circle', { cx: 48, cy: 52, r: 34, fill: '#FBBF24' }),
      React.createElement('ellipse', { cx: 48, cy: 62, rx: 18, ry: 15, fill: '#FDE68A' }),
      React.createElement('path', { d: 'M 48 18 C 46 9 51 9 48 18 Z', fill: '#B45309' }),
      React.createElement('path', { d: 'M 38 56 L 58 56 L 48 68 Z', fill: '#7C2D12' }),
      eyesClosed
        ? React.createElement('g', { key: 'closed' },
            React.createElement('path', { d: 'M 33 46 Q 38 49 43 46', fill: 'none', stroke: '#1F2937', strokeWidth: 2.5, strokeLinecap: 'round' }),
            React.createElement('path', { d: 'M 53 46 Q 58 49 63 46', fill: 'none', stroke: '#1F2937', strokeWidth: 2.5, strokeLinecap: 'round' }),
          )
        : React.createElement('g', { key: 'open' },
            React.createElement('circle', { cx: 38, cy: 46, r: 7, fill: '#ffffff' }),
            React.createElement('circle', { cx: 58, cy: 46, r: 7, fill: '#ffffff' }),
            React.createElement('circle', { cx: 38 + eye.x, cy: 46 + eye.y, r: 3.5, fill: '#1F2937' }),
            React.createElement('circle', { cx: 58 + eye.x, cy: 46 + eye.y, r: 3.5, fill: '#1F2937' }),
          ),
      React.createElement('path', { d: 'M 42 60 Q 48 64 54 60', fill: 'none', stroke: '#7C2D12', strokeWidth: 2, strokeLinecap: 'round' }),
    ),
  )
}

// ── 悬浮萌宠 ────────────────────────────────────────────────────────────────
function BeastPet({ scope, sessions, t, inputBridge }) {
  const snap = useScope(scope)
  const value = snap && snap.value && typeof snap.value === 'object' ? snap.value : null
  const running = useRunning(sessions)
  const [pos, setPos] = useState(() => {
    const p = value && value.petPos
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : defaultPos()
  })
  const dragRef = useRef(null)
  const [reacting, setReacting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [blink, setBlink] = useState(false)
  const [eye, setEye] = useState({ x: 0, y: 0 })

  const enabled = value ? value.enabled !== false : true
  const petEnabled = value ? value.petEnabled !== false : true
  if (!petEnabled) return null

  const state = !enabled ? 'sleep' : running ? 'work' : 'idle'
  const title = state === 'sleep' ? t('petSleep') : state === 'work' ? t('petWorking') : t('petAwake')

  // 随机眨眼（活物感）。
  useEffect(() => {
    let closed
    const schedule = () => {
      closed = setTimeout(() => {
        setBlink(true)
        setTimeout(() => { setBlink(false); schedule() }, 130)
      }, 2000 + Math.random() * 4000)
    }
    schedule()
    return () => clearTimeout(closed)
  }, [])

  // 眼睛跟随鼠标（休眠时不跟随）。
  useEffect(() => {
    if (state === 'sleep') return undefined
    const onMove = (e) => {
      const nx = (e.clientX / (window.innerWidth || 1)) * 2 - 1
      const ny = (e.clientY / (window.innerHeight || 1)) * 2 - 1
      setEye({ x: nx * 3, y: ny * 3 })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [state])

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
    setPos({ x: d.baseX + dx, y: d.baseY + dy })
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
      setTimeout(() => setReacting(false), 400)
    }
  }

  const applyCommand = (text) => {
    if (inputBridge && typeof inputBridge.setDraft === 'function') inputBridge.setDraft(text)
    setMenuOpen(false)
  }

  const petDiv = React.createElement(
    'div',
    {
      role: 'button',
      tabIndex: 0,
      title,
      'aria-label': title,
      onPointerDown, onPointerMove, onPointerUp,
      style: {
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 100000,
        width: 52, height: 52, cursor: 'grab', userSelect: 'none', touchAction: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
        background: state === 'work' ? 'rgba(251,146,60,0.14)' : 'rgba(34,34,34,0.06)',
        filter: state === 'sleep' ? 'grayscale(1) opacity(0.55)' : 'none',
        boxShadow: state === 'work' ? '0 0 0 4px rgba(251,146,60,0.18)' : 'none',
        transition: 'filter 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
      },
    },
    React.createElement(BeastMascot, { state, reacting, blink, eye }),
  )

  const menu = menuOpen ? React.createElement(
    'div',
    { key: 'menu', onClick: (e) => e.stopPropagation(), style: {
      position: 'fixed', left: Math.max(8, pos.x - 240), top: Math.min((window.innerHeight || 800) - 140, pos.y),
      zIndex: 100001, minWidth: 220, borderRadius: 12, overflow: 'hidden',
      background: 'rgba(17,24,39,0.97)', color: '#f3f4f6', boxShadow: '0 16px 48px rgba(0,0,0,0.4)', padding: 6,
    } },
    React.createElement('button', { onClick: () => applyCommand('/tame '), style: menuItemStyle },
      React.createElement('span', { style: { fontWeight: 700, fontFamily: 'monospace' } }, t('menuTame')),
      React.createElement('span', { style: { fontSize: 11, opacity: 0.7 } }, t('menuTameDesc')),
    ),
    React.createElement('div', { style: { height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 8px' } }),
    React.createElement('button', { onClick: () => { scope.set('enabled', !enabled); setMenuOpen(false) }, style: menuItemStyle },
      React.createElement('span', null, enabled ? t('menuToggleSleep') : t('menuToggleWake')),
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
function BeastSettings({ scope, t }) {
  const snap = useScope(scope)
  const value = snap && snap.value && typeof snap.value === 'object' ? snap.value : null

  if (!value) return React.createElement('div', { style: { padding: 16, opacity: 0.6 } }, t('loading'))

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 20, padding: 16, maxWidth: 560 } },
    Row({ label: t('tField'), hint: t('tFieldHint'), checked: value.enabled !== false, onChange: (v) => scope.set('enabled', v) }),
    Row({ label: t('tPet'), hint: t('tPetHint'), checked: value.petEnabled !== false, onChange: (v) => scope.set('petEnabled', v) }),
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

  // 悬浮萌宠（root 层 frame 级浮层，高于各列、不遮挡按钮）。
  ctx.effect(
    () => ctx.slots.inject('shell.overlay', function* () {
      yield ctx.slots.register(
        { name: 'shell.overlay', id: 'beast-tamer-pet', order: 0, inject: () => petInject },
        BeastPet,
      )
    }),
    'beast-tamer: floating pet',
  )

  // 设置面板「插件」分区里的「驯兽场」标签页。
  ctx.effect(
    () => ctx.slots.inject('settings.plugins.tab', function* () {
      yield ctx.slots.register(
        { name: 'settings.plugins.tab', id: 'beast-tamer', order: 30, label: () => t('nav'), inject: () => settingsInject },
        BeastSettings,
      )
    }),
    'beast-tamer: settings tab',
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
