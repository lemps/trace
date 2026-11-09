// Whether resting on Sessions in the rail slides out your recent sessions
// (RailRecents). Off unless the user turns it on in Settings → Sidebar: a list
// popping out of the rail is a surprise until you've asked for it.

const KEY = "trace.recentsFlyout";

export const DEFAULT_RECENTS_FLYOUT = false;

/** A stored value: on only if it says so, so anything else (nothing stored yet) is off. */
export function parseRecentsFlyout(raw: unknown): boolean {
  return raw === "on";
}

export function loadRecentsFlyout(): boolean {
  try {
    return parseRecentsFlyout(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_RECENTS_FLYOUT;
  }
}

export function saveRecentsFlyout(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // best-effort persistence, like the app's other view prefs
  }
}
