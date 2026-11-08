// How long the pointer rests on Sessions in the rail before its recent sessions
// slide out (RailRecents). Long enough by default that passing over the rail
// doesn't pop the list; the user picks another wait in Settings → Sidebar.

const KEY = "trace.recentsDelay";

/** The waits offered, in milliseconds. */
export const RECENTS_DELAYS = [0, 500, 1000, 2000, 3000] as const;
export type RecentsDelay = (typeof RECENTS_DELAYS)[number];
export const DEFAULT_RECENTS_DELAY: RecentsDelay = 2000;

/** A stored value, if it is one of the offered waits; otherwise the default. */
export function parseRecentsDelay(raw: unknown): RecentsDelay {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return (RECENTS_DELAYS as readonly unknown[]).includes(n)
    ? (n as RecentsDelay)
    : DEFAULT_RECENTS_DELAY;
}

export function loadRecentsDelay(): RecentsDelay {
  try {
    return parseRecentsDelay(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_RECENTS_DELAY;
  }
}

export function saveRecentsDelay(ms: RecentsDelay): void {
  try {
    localStorage.setItem(KEY, String(ms));
  } catch {
    // best-effort persistence, like the app's other view prefs
  }
}
