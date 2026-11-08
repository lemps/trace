// What the first run remembers, in one localStorage key: whether it has been
// shown, and which launch-notice problems the user dismissed. Read and written
// only through the setup store.

export interface SetupPrefs {
  /** The first run has been shown; later launches only check. */
  done: boolean;
  /** `problemKey` of the last launch notice the user closed. */
  dismissed: string;
}

export const SETUP_KEY = "trace.setup";

export const DEFAULT_SETUP: SetupPrefs = { done: false, dismissed: "" };

/** Prefs from the stored JSON; anything unreadable counts as never set up. */
export function parseSetup(raw: string | null): SetupPrefs {
  if (!raw) return DEFAULT_SETUP;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return DEFAULT_SETUP;
    const { done, dismissed } = v as { done?: unknown; dismissed?: unknown };
    return {
      done: done === true,
      dismissed: typeof dismissed === "string" ? dismissed : "",
    };
  } catch {
    return DEFAULT_SETUP;
  }
}

export function loadSetup(): SetupPrefs {
  try {
    return parseSetup(localStorage.getItem(SETUP_KEY));
  } catch {
    return DEFAULT_SETUP;
  }
}

export function saveSetup(prefs: SetupPrefs): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(prefs));
  } catch {
    // Unavailable storage: the first run may show again next launch, nothing worse.
  }
}
