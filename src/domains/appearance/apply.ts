import { setInterfaceZoom, setWindowTheme } from "@/ipc/window";
import { fontStack } from "./prefs";
import { activeTheme, isMotionReduced, useAppearance } from "./store";
import { terminalBackground } from "./terminalTheme";
import { accentOf, DEFAULT_ACCENT, schemeOf } from "./themes";

// Pushes Appearance into the document: data-theme / data-density / data-motion
// on <html> (themes.css keys off them), the accent hue, UI font and terminal
// background as root custom properties, and the native window's theme + zoom.
// Painted surfaces that can't read CSS (xterm, Vega, mermaid) subscribe to the
// store themselves.

function applyNow(): void {
  const s = useAppearance.getState();
  const { prefs } = s;
  const theme = activeTheme(s);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.density = prefs.density;
  root.dataset.motion = isMotionReduced(s) ? "reduce" : "full";

  const setVar = (name: string, value: string) => {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  };
  const accent = accentOf(prefs.accent);
  const isDefault = prefs.accent === DEFAULT_ACCENT;
  setVar("--accent-h", isDefault ? "" : String(accent.hue));
  setVar("--accent-sat", isDefault ? "" : String(accent.sat));
  setVar("--font-ui", fontStack(prefs.uiFont, "--font-sans-default"));
  setVar("--term-bg", terminalBackground());

  setWindowTheme(schemeOf(theme));
}

let lastZoom = 100;

/**
 * Apply the saved appearance before first paint, then keep it current: on
 * every pref change, and when the OS switches light/dark or reduce-motion.
 */
export function initAppearance(): void {
  applyNow();
  lastZoom = useAppearance.getState().prefs.uiScale;
  if (lastZoom !== 100) setInterfaceZoom(lastZoom / 100);

  useAppearance.subscribe((s) => {
    applyNow();
    // Zoom only when it changes: setZoom reflows the whole page.
    if (s.prefs.uiScale !== lastZoom) {
      lastZoom = s.prefs.uiScale;
      setInterfaceZoom(lastZoom / 100);
    }
  });

  const scheme = window.matchMedia("(prefers-color-scheme: light)");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sync = () =>
    useAppearance.getState().setSystem(scheme.matches ? "light" : "dark", motion.matches);
  scheme.addEventListener("change", sync);
  motion.addEventListener("change", sync);
}
