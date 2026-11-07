import type { Os } from "../os.ts";
import { chordsCollide, formatChord, parseChord } from "./chord.ts";
import { type Overrides, type Scope, SHORTCUTS, type ShortcutDef } from "./registry.ts";

// What a shortcut may be bound to: never a key a terminal or text box needs, never one
// the system or the webview keeps for itself, and never one another shortcut already
// answers to where both listen.

/** Keys the OS or the webview acts on before (or despite) the page. */
const RESERVED: Record<"mac" | "pc", string[]> = {
  mac: [
    "Meta+q",
    "Meta+w",
    "Meta+h",
    "Meta+m",
    "Meta+c",
    "Meta+v",
    "Meta+x",
    "Meta+a",
    "Meta+z",
    "Shift+Meta+z",
    "Meta+,",
    "Meta+Tab",
    "Meta+Space",
    "Meta+`",
    "Alt+Meta+h", // hide others
    "Ctrl+Meta+f", // full screen
    "Ctrl+Meta+q", // lock the screen
    "Shift+Meta+3", // screenshots
    "Shift+Meta+4",
    "Shift+Meta+5",
  ],
  // WebView2 (Windows) and WebKitGTK (Linux): reload, find, print, zoom, dev tools.
  // Ctrl+Shift+J would open the console in a browser, but WebView2 lets the page's
  // preventDefault win, and it's the orchestrator's default.
  pc: [
    "F5",
    "Ctrl+F5",
    "Ctrl+r",
    "Ctrl+Shift+r",
    "Ctrl+f",
    "Ctrl+g",
    "Ctrl+Shift+g",
    "F3",
    "Ctrl+p",
    "Ctrl+Shift+i",
    "F12",
    "F7",
    "Ctrl+=",
    "Ctrl+Shift+=", // Ctrl++
    "Ctrl+-",
    "Ctrl+0",
    "Alt+F4",
    "Ctrl+w",
    "Ctrl+Shift+Delete",
  ],
};

const EDITING_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Space",
]);

const isDigitKey = (key: string) => key === "#" || (key.length === 1 && key >= "0" && key <= "9");

/**
 * Whether a focused terminal needs this chord: typing (bare or Shift), Ctrl chords
 * (control characters, AltGr's Ctrl+Alt on Windows), Alt/⌥ chords (readline's word
 * moves; characters on macOS) and editing keys under Ctrl or Alt. Off macOS the app
 * has Ctrl+Shift and Ctrl+digit (tab numbers); on macOS everything with ⌘.
 */
export function terminalNeeds(chord: string, os: Os): boolean {
  const p = parseChord(chord);
  if (p.key === "Click") return false;
  if (os === "macos") return !p.meta;
  if (p.meta) return false; // the Windows key: the OS's, not the terminal's
  if (!p.ctrl) return !/^F\d+$/.test(p.key) || p.alt;
  if (p.alt) return true;
  if (p.shift) return EDITING_KEYS.has(p.key) && p.key !== "Enter";
  return !isDigitKey(p.key);
}

/** Copy, paste, cut, select all, undo and redo: the page's selection needs them anywhere. */
function isClipboardKey(chord: string, os: Os): boolean {
  const p = parseChord(chord);
  const held = os === "macos" ? p.meta && !p.ctrl : p.ctrl && !p.meta;
  return held && !p.alt && /^[acvxyz]$/.test(p.key);
}

/**
 * Whether a text box needs this chord: the clipboard keys, word and line moves
 * (Ctrl/Alt/⌘ with arrows, Backspace, Home…), and on macOS ⌥ chords, which type
 * characters. ⏎ under a modifier stays free: that's what send-style shortcuts use.
 */
export function textNeeds(chord: string, os: Os): boolean {
  const p = parseChord(chord);
  if (isClipboardKey(chord, os)) return true;
  if ((p.ctrl || p.alt || p.meta) && EDITING_KEYS.has(p.key) && p.key !== "Enter") return true;
  return os === "macos" && p.alt && !p.meta && !p.ctrl && p.key.length === 1;
}

/** Whether two places' shortcuts can both hear one key press. */
export function scopesOverlap(a: Scope, b: Scope): boolean {
  // Clicks are each on their own element, and never a key press.
  if (a === "mouse" || b === "mouse") return false;
  if (a === b || a === "app" || b === "app") return true;
  // The terminal sits inside a detail view, and leaves tab numbers to it.
  return (a === "terminal" && b === "detail") || (a === "detail" && b === "terminal");
}

function reserved(chord: string, os: Os): boolean {
  const list = RESERVED[os === "macos" ? "mac" : "pc"];
  return list.some((r) => chordsCollide(r, chord));
}

/** A shortcut that takes a number: its binding names the modifiers, `#` the 1–9. */
export function isNumbered(def: ShortcutDef): boolean {
  return def.mac.some((c) => c.endsWith("#"));
}

/** Why a chord can't be a shortcut in this scope, before conflicts — or null. */
function scopeProblem(def: ShortcutDef, chord: string, os: Os): string | null {
  const p = parseChord(chord);
  const appKeys = os === "macos" ? "⌘" : "Ctrl+Shift";
  // A terminal's own shortcuts (find, Copy Context) are taken from it too.
  if (def.scope === "app" || def.scope === "detail" || def.scope === "terminal") {
    if (terminalNeeds(chord, os)) {
      return `${formatChord(chord, os)} is the terminal's. Use ${appKeys} with a key.`;
    }
  } else if (def.scope === "reply") {
    if (!p.ctrl && !p.meta && !p.alt) return "Hold a modifier, or it types into the reply.";
    if (textNeeds(chord, os)) return `${formatChord(chord, os)} edits the reply.`;
  } else if (def.scope === "inbox") {
    if (isClipboardKey(chord, os)) return `${formatChord(chord, os)} is the clipboard's.`;
    if (p.key === "Tab" || p.key === "Escape")
      return `${formatChord(chord, os)} is kept for moving focus.`;
  }
  if ((p.key === "#") !== isNumbered(def)) {
    return p.key === "#"
      ? "Only numbered shortcuts take 1–9."
      : "Press a modifier with a number key.";
  }
  return null;
}

/**
 * Why `chord` can't be bound to `def` given the other shortcuts' current bindings,
 * or null when it can. The reason is one plain sentence for the Settings row.
 */
export function bindingProblem(
  def: ShortcutDef,
  chord: string,
  keymap: Record<string, string[]>,
  os: Os
): string | null {
  if (def.isFixed) return "This one is built in.";
  if (reserved(chord, os)) return `${formatChord(chord, os)} is kept by the system.`;
  const scoped = scopeProblem(def, chord, os);
  if (scoped) return scoped;
  const other = SHORTCUTS.find(
    (s) =>
      s.id !== def.id &&
      scopesOverlap(s.scope, def.scope) &&
      (keymap[s.id] ?? []).some((c) => chordsCollide(c, chord))
  );
  return other ? `Already used by “${other.label}”.` : null;
}

/**
 * Stored rebindings the rules still allow on this OS (stored data is untrusted, and
 * the rules may have tightened since it was saved): a refused chord would otherwise
 * take a key from the terminal. Clashes between shortcuts are left for Settings to flag.
 */
export function allowedOverrides(overrides: Overrides, os: Os): Overrides {
  const out: Overrides = {};
  for (const [id, chords] of Object.entries(overrides)) {
    const def = SHORTCUTS.find((s) => s.id === id);
    if (!def || def.isFixed) continue;
    const ok = chords.filter((c) => !reserved(c, os) && scopeProblem(def, c, os) === null);
    if (ok.length > 0) out[id] = ok;
  }
  return out;
}

/** For a number shortcut, the chord pressed becomes its `#` form (Ctrl+3 → Ctrl+#). */
export function asBinding(def: ShortcutDef, chord: string): string {
  if (!isNumbered(def)) return chord;
  const p = parseChord(chord);
  return /^[1-9]$/.test(p.key) ? `${chord.slice(0, -1)}#` : chord;
}

/** Shortcuts that answer to the same key in places that overlap, by id → the others. */
export function findConflicts(keymap: Record<string, string[]>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const a of SHORTCUTS) {
    for (const b of SHORTCUTS) {
      if (a.id === b.id || !scopesOverlap(a.scope, b.scope)) continue;
      const clash = (keymap[a.id] ?? []).some((ca) =>
        (keymap[b.id] ?? []).some((cb) => chordsCollide(ca, cb))
      );
      if (clash) out.set(a.id, [...(out.get(a.id) ?? []), b.id]);
    }
  }
  return out;
}
