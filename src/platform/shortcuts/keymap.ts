import { create } from "zustand";
import { currentOs } from "../os";
import { cleanOverrides, effectiveKeymap, type Overrides } from "./registry";

// The user's rebindings, and the one place they touch localStorage. Handlers read the
// effective keymap on each key press (`getState`), hints subscribe through the hook,
// so a change in Settings applies at once everywhere.

const STORAGE_KEY = "trace.shortcuts";

function load(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? {} : cleanOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

function save(overrides: Overrides) {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Persistence is best-effort; the rebinding still applies until relaunch.
  }
}

interface KeymapState {
  overrides: Overrides;
  /** Every shortcut's chords now, rebindings applied. */
  keymap: Record<string, string[]>;
  rebind: (id: string, chords: string[]) => void;
  reset: (id: string) => void;
  resetAll: () => void;
}

function withOverrides(overrides: Overrides) {
  save(overrides);
  return { overrides, keymap: effectiveKeymap(overrides, currentOs) };
}

const initial = load();

export const useKeymapStore = create<KeymapState>((set) => ({
  overrides: initial,
  keymap: effectiveKeymap(initial, currentOs),
  rebind: (id, chords) => set((s) => withOverrides({ ...s.overrides, [id]: chords })),
  reset: (id) =>
    set((s) => {
      const { [id]: _dropped, ...rest } = s.overrides;
      return withOverrides(rest);
    }),
  resetAll: () => set(withOverrides({})),
}));

import.meta.hot?.accept(() => location.reload());
