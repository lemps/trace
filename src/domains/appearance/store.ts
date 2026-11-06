import { create } from "zustand";
import { type AppearancePrefs, DEFAULT_PREFS, loadPrefs, savePrefs } from "./prefs";
import { type ColorScheme, resolveTheme, type ThemeId } from "./themes";

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
  update: (patch: Partial<AppearancePrefs>) => void;
  reset: () => void;
  setSystem: (scheme: ColorScheme, reducedMotion: boolean) => void;
}

export const useAppearance = create<AppearanceStore>((set, get) => ({
  prefs: loadPrefs(),
  systemScheme: media("(prefers-color-scheme: light)") ? "light" : "dark",
  systemReducedMotion: media("(prefers-reduced-motion: reduce)"),
  update(patch) {
    const prefs = { ...get().prefs, ...patch };
    savePrefs(prefs);
    set({ prefs });
  },
  reset() {
    savePrefs(DEFAULT_PREFS);
    set({ prefs: DEFAULT_PREFS });
  },
  setSystem(systemScheme, systemReducedMotion) {
    set({ systemScheme, systemReducedMotion });
  },
}));

/** The theme in effect now ("system" resolved against the OS). */
export function activeTheme(s: AppearanceStore = useAppearance.getState()): ThemeId {
  return resolveTheme(s.prefs.theme, s.systemScheme);
}

/** Whether motion should be reduced now (forced, or the OS asks for it). */
export function isMotionReduced(s: AppearanceStore = useAppearance.getState()): boolean {
  return s.prefs.motion === "reduce" || s.systemReducedMotion;
}

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
