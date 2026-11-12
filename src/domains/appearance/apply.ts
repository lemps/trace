import { setInterfaceZoom, setWindowTheme } from "@/ipc/window";
import { chatStyleVars } from "./chatStyle";
import { fontStack } from "./fontStack";
import { activeTheme, isMotionReduced, useAppearance } from "./store";
import { terminalBackground } from "./terminalTheme";
import { accentOf, DEFAULT_ACCENT, schemeOf } from "./themes";

// Pushes Appearance into the document: data-theme / data-density / data-motion
// on <html> (themes.css keys off them) and data-code-theme (code-themes.css);
// the accent, UI and code fonts, terminal background and chat style as root custom
// properties; and the native window's theme + zoom.
// Painted surfaces that can't read CSS (xterm, Vega, mermaid) subscribe to the
// store themselves.

function setVar(name: string, value: string): void {
  const root = document.documentElement;
  if (value) root.style.setProperty(name, value);
  else root.style.removeProperty(name);
}

/**
 * The Chat & transcript settings, as custom properties and data-code-theme on
 * <html>. Exported for the dev chat fixture, which skips the rest.
 */
export function applyChatStyle(): void {
  const { chat } = useAppearance.getState().prefs;
  for (const [name, value] of Object.entries(chatStyleVars(chat))) setVar(name, value);
  document.documentElement.dataset.codeTheme = chat.codeTheme;
}

function applyDocument(): void {
  const s = useAppearance.getState();
  const { prefs } = s;
  const root = document.documentElement;
  root.dataset.theme = activeTheme(s);
  root.dataset.density = prefs.density;
  root.dataset.motion = isMotionReduced(s) ? "reduce" : "full";

  const accent = accentOf(prefs.accent);
  const isDefault = prefs.accent === DEFAULT_ACCENT;
  setVar("--accent-h", isDefault ? "" : String(accent.hue));
  setVar("--accent-sat", isDefault ? "" : String(accent.sat));
  setVar("--font-ui", fontStack(prefs.uiFont, "var(--font-sans-default)"));
  // The code font: --font-mono everywhere (tokens.css reads --font-code first).
  setVar("--font-code", fontStack(prefs.monoFont, "var(--font-mono-default)"));
  setVar("--term-bg", terminalBackground());
  applyChatStyle();
}

// Native calls are made only when their value changes, not on every pref edit.
let windowTheme: string | undefined;
let requestedZoom = 100;

function applyNative(): void {
  const s = useAppearance.getState();
  // "System" hands the title bar back to the OS (see setWindowTheme).
  const next = s.prefs.theme === "system" ? null : schemeOf(activeTheme(s));
  if (String(next) !== windowTheme) {
    windowTheme = String(next);
    setWindowTheme(next);
  }
  const scale = s.prefs.uiScale;
  if (scale !== requestedZoom) {
    requestedZoom = scale;
    // Terminals compensate their font for the zoom only once it has landed
    // (appliedScale), so a PTY isn't resized for a zoom that isn't on screen yet.
    void setInterfaceZoom(scale / 100).then(() => {
      if (useAppearance.getState().prefs.uiScale === scale) s.setAppliedScale(scale);
    });
  }
}

/**
 * Apply the saved appearance before first paint, then keep it current: on
 * every pref change, and when the OS switches light/dark or reduce-motion.
 */
export function initAppearance(): void {
  applyDocument();
  applyNative();
  useAppearance.subscribe(() => {
    applyDocument();
    applyNative();
  });

  const scheme = window.matchMedia("(prefers-color-scheme: light)");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sync = () =>
    useAppearance.getState().setSystem(scheme.matches ? "light" : "dark", motion.matches);
  scheme.addEventListener("change", sync);
  motion.addEventListener("change", sync);
}

// A hot update would leave duplicate subscriptions and listeners, so reload instead.
import.meta.hot?.accept(() => location.reload());
