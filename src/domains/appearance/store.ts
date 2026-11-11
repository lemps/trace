import { create } from "zustand";
import type { ChatStyle } from "./chatStyle";
import { type AppearancePrefs, DEFAULT_PREFS, loadPrefs, savePrefs, systemThemes } from "./prefs";
import { type ColorScheme, resolveTheme, type ThemeId } from "./themes";
import { stepScale, type ZoomStep } from "./zoom";

// Appearance state: the user's persisted prefs plus the two OS preferences
// they can follow (light/dark, reduce motion), which apply.ts keeps current.
// Loaded once, written by `update` — no effect pairs.

function media(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

interface AppearanceStore {
  prefs: AppearancePrefs;
  systemScheme: ColorScheme;
  systemReducedMotion: boolean;
  /**
   * The interface zoom actually on screen (percent). It trails `prefs.uiScale`
   * until the webview's async setZoom lands; terminals size their font by it.
   */
  appliedScale: number;
  update: (patch: Partial<AppearancePrefs>) => void;
  /** Change some of the Chat & transcript settings. */
  updateChat: (patch: Partial<ChatStyle>) => void;
  /** Back to the defaults: every pref, or only the `keys` given (one group's). */
  reset: (keys?: readonly (keyof AppearancePrefs)[]) => void;
  setSystem: (scheme: ColorScheme, reducedMotion: boolean) => void;
  setAppliedScale: (scale: number) => void;
}

function pickDefaults(keys: readonly (keyof AppearancePrefs)[]): Partial<AppearancePrefs> {
  return Object.fromEntries(keys.map((k) => [k, DEFAULT_PREFS[k]]));
}

export const useAppearance = create<AppearanceStore>((set, get) => ({
  prefs: loadPrefs(),
  systemScheme: media("(prefers-color-scheme: light)") ? "light" : "dark",
  systemReducedMotion: media("(prefers-reduced-motion: reduce)"),
  // The webview starts at 100%; apply.ts raises it to the saved scale.
  appliedScale: 100,
  update(patch) {
    const prefs = { ...get().prefs, ...patch };
    savePrefs(prefs);
    set({ prefs });
  },
  updateChat(patch) {
    get().update({ chat: { ...get().prefs.chat, ...patch } });
  },
  reset(keys) {
    const prefs = keys ? { ...get().prefs, ...pickDefaults(keys) } : DEFAULT_PREFS;
    savePrefs(prefs);
    set({ prefs });
  },
  setSystem(systemScheme, systemReducedMotion) {
    set({ systemScheme, systemReducedMotion });
  },
  setAppliedScale(appliedScale) {
    set({ appliedScale });
  },
}));

/** The theme in effect now ("system" resolved against the OS). */
export function activeTheme(s: AppearanceStore = useAppearance.getState()): ThemeId {
  return resolveTheme(s.prefs.theme, s.systemScheme, systemThemes(s.prefs));
}

/** The zoom shortcuts: step Interface size the way its control would. */
export function zoomBy(step: ZoomStep): void {
  const s = useAppearance.getState();
  const uiScale = stepScale(s.prefs.uiScale, step);
  if (uiScale !== s.prefs.uiScale) s.update({ uiScale });
}

/** Whether motion should be reduced now (forced, or the OS asks for it). */
export function isMotionReduced(s: AppearanceStore = useAppearance.getState()): boolean {
  return s.prefs.motion === "reduce" || s.systemReducedMotion;
}

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
