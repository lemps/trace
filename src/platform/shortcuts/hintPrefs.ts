import { create } from "zustand";

// Whether buttons, tabs and headers show their shortcut as a chip (Settings →
// Shortcuts). Off by default: the shortcut is in the tooltip, the menus and the cheat
// sheet. Loaded once and written by its setter; the stored value is untrusted.

const STORAGE_KEY = "trace.shortcuts.buttonHints";

/** Only an exact "true" turns it on; anything else stored is the default (off). */
export function parseButtonHints(raw: string | null): boolean {
  return raw === "true";
}

function load(): boolean {
  try {
    return parseButtonHints(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

function save(on: boolean) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "true");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Persistence is best-effort; the choice still applies until relaunch.
  }
}

interface HintPrefs {
  onButtons: boolean;
  setOnButtons: (on: boolean) => void;
}

export const useHintPrefs = create<HintPrefs>((set) => ({
  onButtons: load(),
  setOnButtons(on) {
    save(on);
    set({ onButtons: on });
  },
}));
