window.__ModuleLoader__.load({
  id: "dsh-beast-master",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);
var NS = "beast-tamer";
var inject = ["settingsScope", "slots", "connection", "remote", "sessions", "locale"];
var ZH = {
  nav: "\u9A6F\u517D\u573A",
  petAwake: "\u9A6F\u517D\u5E08\uFF1A\u5F00\u667A\u4E2D\uFF08\u70B9\u51FB\u4F11\u7720\uFF0C\u957F\u6309\u62D6\u62FD\uFF09",
  petSleep: "\u9A6F\u517D\u5E08\uFF1A\u5DF2\u4F11\u7720\uFF08\u70B9\u51FB\u5524\u9192\uFF09",
  petWorking: "\u9A6F\u517D\u5E08\uFF1A\u6B63\u5728\u9A6D\u517D\u2026",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  tField: "\u9A6F\u517D\u573A\uFF08\u5185\u6838\u5F00\u667A\uFF09",
  tFieldHint: "\u5F00\u542F\u540E\uFF0C\u6BCF\u6B21\u5BF9\u8BDD\u6CE8\u5165\u9A6F\u517D\u5E08\u5185\u6838\uFF0C\u8BA9\u667A\u80FD\u4F53\u66F4\u61C2\u4F60\u3002",
  tPet: "\u60AC\u6D6E\u840C\u5BA0",
  tPetHint: "\u53F3\u4FA7\u663E\u793A\u9A6F\u517D\u5E08\u840C\u5BA0\uFF0C\u70B9\u51FB\u5F00\u5173\u5185\u6838\u3001\u957F\u6309\u62D6\u62FD\u3002",
  tMode: "\u5185\u6838\u6863\u4F4D",
  modeMinimal: "\u6781\u7B80\uFF08\u6700\u7701 token\uFF09",
  modeBalanced: "\u5747\u8861\uFF08\u9ED8\u8BA4\uFF09",
  modeFull: "\u5B8C\u6574\uFF08\u542B\u793A\u4F8B\uFF09",
  tLang: "\u5185\u6838\u8BED\u8A00",
  langZh: "\u4E2D\u6587",
  langEn: "English",
  tAnalyze: "\u9700\u6C42\u5256\u6790\u5DE5\u5177 beast_analyze",
  tAnalyzeHint: "\u5F00\u542F\u540E\u53EF\u7528\u5DE5\u5177\u4E00\u952E\u751F\u6210\u89C4\u8303 markdown \u8BA1\u5212\uFF08\u6BCF\u6B21\u591A\u4E00\u6B21\u6A21\u578B\u8C03\u7528\uFF09\u3002",
  tOverride: "\u5185\u6838\u8986\u76D6\uFF08\u53EF\u9009\uFF09",
  tOverrideHint: "\u7559\u7A7A\u4F7F\u7528\u4E0A\u65B9\u6863\u4F4D\u7684\u5185\u6838\uFF1B\u7C98\u8D34\u81EA\u5B9A\u4E49\u6587\u672C\u5219\u4F18\u5148\u4F7F\u7528\u3002",
  overridePlaceholder: "\u5728\u6B64\u7C98\u8D34\u81EA\u5B9A\u4E49\u9A6F\u517D\u5E08\u5185\u6838\u2026"
};
var EN = {
  nav: "Beast Ground",
  petAwake: "Beast Tamer: awake (click to sleep, long-press to drag)",
  petSleep: "Beast Tamer: asleep (click to wake)",
  petWorking: "Beast Tamer: taming\u2026",
  loading: "Loading\u2026",
  tField: "Beast Ground (kernel)",
  tFieldHint: "Inject the Beast Tamer kernel into every turn to make the agent understand you.",
  tPet: "Floating pet",
  tPetHint: "Show the pet; click to toggle the kernel, long-press to drag.",
  tMode: "Kernel level",
  modeMinimal: "Minimal (fewest tokens)",
  modeBalanced: "Balanced (default)",
  modeFull: "Full (with example)",
  tLang: "Kernel language",
  langZh: "\u4E2D\u6587",
  langEn: "English",
  tAnalyze: "beast_analyze tool",
  tAnalyzeHint: "Generate a canonical markdown plan in one tool call (costs one extra model call each time).",
  tOverride: "Kernel override (optional)",
  tOverrideHint: "Empty uses the level above; pasted text takes priority.",
  overridePlaceholder: "Paste your custom Beast Tamer kernel\u2026"
};
function useScope(scope) {
  const subscribe = (0, import_react.useCallback)((cb) => scope.subscribe(cb), [scope]);
  const getSnapshot = (0, import_react.useCallback)(() => scope.getSnapshot(), [scope]);
  return (0, import_react.useSyncExternalStore)(subscribe, getSnapshot);
}
function useRunning(sessions) {
  const subscribe = (0, import_react.useCallback)((cb) => sessions && sessions.list ? sessions.list.subscribe(cb) : () => {
  }, [sessions]);
  const getSnapshot = (0, import_react.useCallback)(() => {
    if (!sessions || !sessions.list) return false;
    try {
      const snap = sessions.list.getSnapshot();
      const current = snap && snap.current;
      if (!current) return false;
      const row = (snap.items || []).find((r) => r.id === current);
      return !!(row && row.running);
    } catch {
      return false;
    }
  }, [sessions]);
  return (0, import_react.useSyncExternalStore)(subscribe, getSnapshot);
}
function defaultPos() {
  try {
    const w = window.innerWidth || 1200;
    const h = window.innerHeight || 800;
    return { x: Math.max(8, w - 76), y: Math.max(8, Math.round(h / 2 - 26)) };
  } catch {
    return { x: 700, y: 300 };
  }
}
function BeastPet({ scope, sessions, t }) {
  const snap = useScope(scope);
  const value = snap && snap.value && typeof snap.value === "object" ? snap.value : null;
  const running = useRunning(sessions);
  const [pos, setPos] = (0, import_react.useState)(() => {
    const p = value && value.petPos;
    return p && typeof p.x === "number" && typeof p.y === "number" ? { x: p.x, y: p.y } : defaultPos();
  });
  const dragRef = (0, import_react.useRef)(null);
  const [reacting, setReacting] = (0, import_react.useState)(false);
  const enabled = value ? value.enabled !== false : true;
  const petEnabled = value ? value.petEnabled !== false : true;
  if (!petEnabled) return null;
  const state = !enabled ? "sleep" : running ? "work" : "idle";
  const face = state === "sleep" ? "\u{1F4A4}" : state === "work" ? "\u{1F525}" : "\u{1F43E}";
  const title = state === "sleep" ? t("petSleep") : state === "work" ? t("petWorking") : t("petAwake");
  const onPointerDown = (e) => {
    const timer = setTimeout(() => {
      if (dragRef.current) dragRef.current.armed = true;
    }, 280);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: pos.x,
      baseY: pos.y,
      moved: false,
      armed: false,
      timer
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || !d.armed) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setPos({ x: d.baseX + dx, y: d.baseY + dy });
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    if (!d) return;
    clearTimeout(d.timer);
    const wasDrag = d.armed && d.moved;
    dragRef.current = null;
    if (wasDrag) {
      scope.set("petPos", pos);
    } else {
      scope.set("enabled", !enabled);
      setReacting(true);
      setTimeout(() => setReacting(false), 400);
    }
  };
  return import_react.default.createElement(
    "div",
    {
      role: "button",
      tabIndex: 0,
      title,
      "aria-label": title,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      style: {
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 1e5,
        width: 52,
        height: 52,
        cursor: "grab",
        userSelect: "none",
        touchAction: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: state === "work" ? "rgba(251,146,60,0.14)" : "rgba(34,34,34,0.06)",
        filter: state === "sleep" ? "grayscale(1) opacity(0.55)" : "none",
        boxShadow: state === "work" ? "0 0 0 4px rgba(251,146,60,0.18)" : "none",
        transition: "filter 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
        animation: state === "work" ? "beast-pulse 1.1s ease-in-out infinite" : state === "idle" ? "beast-bob 3s ease-in-out infinite" : reacting ? "beast-pop 0.4s ease" : "none",
        transform: reacting ? "scale(1.18)" : "scale(1)"
      }
    },
    import_react.default.createElement(
      "style",
      null,
      "@keyframes beast-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}@keyframes beast-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}@keyframes beast-pop{0%{transform:scale(1)}40%{transform:scale(1.22)}100%{transform:scale(1)}}"
    ),
    import_react.default.createElement("span", { style: { fontSize: 32, lineHeight: 1 } }, face)
  );
}
function Row({ label, hint, checked, onChange }) {
  return import_react.default.createElement(
    "div",
    { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } },
    import_react.default.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 2 } },
      import_react.default.createElement("span", { style: { fontWeight: 600 } }, label),
      import_react.default.createElement("span", { style: { fontSize: 12, opacity: 0.6 } }, hint)
    ),
    import_react.default.createElement("button", {
      onClick: () => onChange(!checked),
      "aria-pressed": checked,
      style: {
        minWidth: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        cursor: "pointer",
        background: checked ? "#10b981" : "rgba(120,120,120,0.3)",
        position: "relative",
        transition: "background 0.2s ease"
      }
    }, import_react.default.createElement("span", {
      style: {
        position: "absolute",
        top: 2,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "#fff",
        left: checked ? 22 : 2,
        transition: "left 0.2s ease"
      }
    }))
  );
}
function Seg({ value, options, onChange }) {
  return import_react.default.createElement(
    "div",
    { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
    options.map(([v, label]) => import_react.default.createElement("button", {
      key: v,
      onClick: () => onChange(v),
      "aria-pressed": value === v,
      style: {
        padding: "6px 12px",
        borderRadius: 8,
        border: "1px solid",
        cursor: "pointer",
        borderColor: value === v ? "#10b981" : "rgba(120,120,120,0.3)",
        background: value === v ? "rgba(16,185,129,0.12)" : "transparent",
        fontWeight: value === v ? 600 : 400
      }
    }, label))
  );
}
function Field({ label, children }) {
  return import_react.default.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 8 } },
    import_react.default.createElement("span", { style: { fontWeight: 600 } }, label),
    children
  );
}
function BeastSettings({ scope, t }) {
  const snap = useScope(scope);
  const value = snap && snap.value && typeof snap.value === "object" ? snap.value : null;
  if (!value) return import_react.default.createElement("div", { style: { padding: 16, opacity: 0.6 } }, t("loading"));
  return import_react.default.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 20, padding: 16, maxWidth: 560 } },
    Row({ label: t("tField"), hint: t("tFieldHint"), checked: value.enabled !== false, onChange: (v) => scope.set("enabled", v) }),
    Row({ label: t("tPet"), hint: t("tPetHint"), checked: value.petEnabled !== false, onChange: (v) => scope.set("petEnabled", v) }),
    Field({ label: t("tMode") }, Seg({
      value: value.mode || "balanced",
      onChange: (v) => scope.set("mode", v),
      options: [["minimal", t("modeMinimal")], ["balanced", t("modeBalanced")], ["full", t("modeFull")]]
    })),
    Field({ label: t("tLang") }, Seg({
      value: value.lang || "zh",
      onChange: (v) => scope.set("lang", v),
      options: [["zh", t("langZh")], ["en", t("langEn")]]
    })),
    Row({ label: t("tAnalyze"), hint: t("tAnalyzeHint"), checked: value.analyzeTool === true, onChange: (v) => scope.set("analyzeTool", v) }),
    Field({ label: t("tOverride"), children: [
      import_react.default.createElement("span", { key: "h", style: { fontSize: 12, opacity: 0.6 } }, t("tOverrideHint")),
      import_react.default.createElement("textarea", {
        key: "ta",
        value: value.kernelOverride || "",
        onChange: (e) => scope.set("kernelOverride", e.target.value),
        rows: 6,
        placeholder: t("overridePlaceholder"),
        style: {
          width: "100%",
          boxSizing: "border-box",
          padding: 8,
          borderRadius: 8,
          border: "1px solid rgba(120,120,120,0.3)",
          background: "transparent",
          fontFamily: "inherit",
          fontSize: 13,
          resize: "vertical"
        }
      })
    ] })
  );
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), "beast-tamer: locale dictionaries");
  const t = ctx.locale.bind(NS);
  const scope = ctx.settingsScope.bind({ namespace: NS });
  const petInject = { scope, sessions: ctx.sessions, t };
  const settingsInject = { scope, t };
  ctx.effect(
    () => ctx.slots.inject("shell.overlay", function* () {
      yield ctx.slots.register(
        { name: "shell.overlay", id: "beast-tamer-pet", order: 0, inject: () => petInject },
        BeastPet
      );
    }),
    "beast-tamer: floating pet"
  );
  ctx.effect(
    () => ctx.slots.inject("settings.plugins.tab", function* () {
      yield ctx.slots.register(
        { name: "settings.plugins.tab", id: "beast-tamer", order: 30, label: () => t("nav"), inject: () => settingsInject },
        BeastSettings
      );
    }),
    "beast-tamer: settings tab"
  );
}

    return module.exports;
  },
});
