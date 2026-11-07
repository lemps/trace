import type { Os } from "../os.ts";
import { SHORTCUTS } from "./definitions.ts";

// Every shortcut trace has, in one list: what it does, where it works and its default
// keys per OS. Handlers ask `src/platform/shortcuts.ts` whether a key event is a given
// shortcut, and hints in the UI format its current binding, so a rebinding in Settings
// reaches both. Fixed ones are listed so Settings shows them and nothing is rebound
// over them; they can't be changed themselves.
//
// Off macOS `Ctrl` belongs to the terminal (Ctrl+C interrupts, Ctrl+K kills a line,
// Ctrl+J is a newline), so app shortcuts add Shift, as terminal emulators do there.
// Tab numbers stay Ctrl+1–9 (docs/WINDOWS_LINUX_PLAN.md, decision 3).

/**
 * Where a shortcut is listened for, which decides what it may collide with and what
 * keys it may take: `app` fires everywhere, terminals and text boxes included. `reply` is the Inbox's
 * reply box, `chat` a chat agent's composer, `settings` a list in Settings, `sessions`
 * a row on the Sessions page.
 */
export type Scope =
  | "app"
  | "detail"
  | "terminal"
  | "find"
  | "inbox"
  | "reply"
  | "chat"
  | "search"
  | "settings"
  | "sessions"
  | "mouse";

export type GroupId =
  | "app"
  | "detail"
  | "terminal"
  | "chat"
  | "inbox"
  | "search"
  | "board"
  | "sessions"
  | "settings";

export const GROUPS: { id: GroupId; label: string; desc: string }[] = [
  { id: "app", label: "Anywhere", desc: "Work on every page, in terminals too." },
  { id: "detail", label: "Agent and ticket views", desc: "While a session or ticket is open." },
  { id: "terminal", label: "Terminal", desc: "In an agent's chat or a shell terminal." },
  { id: "chat", label: "Agent chat", desc: "In a chat agent's view and its message box." },
  { id: "inbox", label: "Inbox", desc: "On the Inbox page, when you aren't typing." },
  { id: "search", label: "Search box", desc: "While the search box has focus." },
  { id: "board", label: "Board", desc: "On a tracker's board." },
  { id: "sessions", label: "Sessions", desc: "On a row in the Sessions page's lists." },
  { id: "settings", label: "Settings", desc: "In Settings → Sidebar's list of pages." },
];

export interface ShortcutDef {
  id: string;
  label: string;
  group: GroupId;
  scope: Scope;
  /** Default chords on macOS and elsewhere; the first is the one hints show. */
  mac: string[];
  pc: string[];
  /** Built in (system, terminal or text-box keys): shown, never rebound. */
  isFixed?: boolean;
}

export { SHORTCUTS };

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function shortcutDef(id: string): ShortcutDef | undefined {
  return BY_ID.get(id);
}

/** Each shortcut's default chords on this OS. */
export function defaultsFor(id: string, os: Os): string[] {
  const def = BY_ID.get(id);
  if (!def) return [];
  return os === "macos" ? def.mac : def.pc;
}

/** User rebindings, by shortcut id: each replaces that shortcut's defaults. */
export type Overrides = Record<string, string[]>;

/** Every shortcut's chords on this OS, with the user's rebindings applied. */
export function effectiveKeymap(overrides: Overrides, os: Os): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const def of SHORTCUTS) {
    const own = def.isFixed ? undefined : overrides[def.id];
    out[def.id] = own && own.length > 0 ? own : defaultsFor(def.id, os);
  }
  return out;
}

/** Drop what isn't a rebinding of a known, rebindable shortcut (stored data is untrusted). */
export function cleanOverrides(raw: unknown): Overrides {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Overrides = {};
  for (const [id, chords] of Object.entries(raw)) {
    const def = BY_ID.get(id);
    if (!def || def.isFixed || !Array.isArray(chords)) continue;
    const valid = chords.filter((c): c is string => typeof c === "string" && c.length > 0);
    if (valid.length > 0) out[id] = valid;
  }
  return out;
}
