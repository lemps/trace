import type { Os } from "../os.ts";

// A chord is one key press with its modifiers, written as a canonical string —
// "Ctrl+Shift+j", "Meta+#", "Alt+ArrowUp", "Enter" — so bindings persist, compare and
// show as plain strings. Modifiers come first in a fixed order; the key is last.
// `#` stands for any of 1–9 (a tab or answer number), and `Click` for a mouse click.

/** The parts of a key event a chord is read from; DOM and React events both fit. */
export interface KeyChord {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface ChordParts {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS", "AltGraph", "Hyper"]);

/** The unshifted key on a US layout, by physical key, for keys Shift turns into symbols. */
const BASE_BY_CODE: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
};

/** The key a press names, independent of what Shift or ⌥ did to the character. */
function baseKey(e: KeyChord): string {
  const code = e.code ?? "";
  if (e.key === " ") return "Space";
  if (e.key.length === 1) {
    if (/^[a-z]$/i.test(e.key) && !e.altKey) return e.key.toLowerCase();
    // ⌥ (and Shift on symbols) change the character; the physical key doesn't change.
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter) return letter[1].toLowerCase();
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (digit) return digit[1];
    if ((e.shiftKey || e.altKey) && BASE_BY_CODE[code]) return BASE_BY_CODE[code];
    if (e.key === "+") return "=";
    return e.key.toLowerCase();
  }
  return e.key;
}

/** The chord a key event presses, or null for a bare modifier (still choosing). */
export function chordFromEvent(e: KeyChord): string | null {
  if (MODIFIER_KEYS.has(e.key) || e.key === "Dead" || e.key === "Unidentified") return null;
  return joinChord({
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
    key: baseKey(e),
  });
}

export function joinChord(p: ChordParts): string {
  const mods = [p.ctrl && "Ctrl", p.alt && "Alt", p.shift && "Shift", p.meta && "Meta"];
  return [...mods.filter(Boolean), p.key].join("+");
}

export function parseChord(chord: string): ChordParts {
  const parts = chord.split("+");
  const key = parts.pop() ?? "";
  return {
    ctrl: parts.includes("Ctrl"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    meta: parts.includes("Meta"),
    key,
  };
}

const isDigit = (key: string) => key.length === 1 && key >= "1" && key <= "9";

/** Same modifiers, and the same key, `#` matching any digit 1–9. */
export function chordsCollide(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = parseChord(a);
  const pb = parseChord(b);
  const sameMods =
    pa.ctrl === pb.ctrl && pa.alt === pb.alt && pa.shift === pb.shift && pa.meta === pb.meta;
  if (!sameMods) return false;
  return (pa.key === "#" && isDigit(pb.key)) || (pb.key === "#" && isDigit(pa.key));
}

/**
 * Whether a pressed chord fires a binding: null if not, else the number it picked
 * (0-based, for a `#` binding) or 0.
 */
export function matchIndex(binding: string, pressed: string): number | null {
  if (binding === pressed) return 0;
  if (!binding.endsWith("#")) return null;
  const p = parseChord(pressed);
  if (!isDigit(p.key)) return null;
  return binding.slice(0, -1) === pressed.slice(0, -1) ? Number(p.key) - 1 : null;
}

const MAC_MODS: [keyof ChordParts, string][] = [
  ["ctrl", "⌃"],
  ["alt", "⌥"],
  ["shift", "⇧"],
  ["meta", "⌘"],
];
const PC_MODS: [keyof ChordParts, string][] = [
  ["ctrl", "Ctrl"],
  ["alt", "Alt"],
  ["shift", "Shift"],
  ["meta", "Win"],
];

const KEY_NAMES: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "⏎",
  "#": "1–9",
  Space: "Space",
  Click: "click",
};
const MAC_KEY_NAMES: Record<string, string> = { Escape: "esc", Backspace: "⌫", Tab: "⇥" };
const PC_KEY_NAMES: Record<string, string> = { Escape: "Esc" };

/** A chord as this OS writes it: "⌘⇧N" on macOS, "Ctrl+Shift+N" elsewhere. */
export function formatChord(chord: string, os: Os): string {
  const p = parseChord(chord);
  const isMac = os === "macos";
  const names = isMac ? MAC_KEY_NAMES : PC_KEY_NAMES;
  const key =
    names[p.key] ?? KEY_NAMES[p.key] ?? (p.key.length === 1 ? p.key.toUpperCase() : p.key);
  const mods = (isMac ? MAC_MODS : PC_MODS).filter(([m]) => p[m]).map(([, label]) => label);
  if (mods.length === 0) return key === "click" ? "Click" : key;
  if (p.key === "Click") return `${mods.join(isMac ? "" : "+")}-click`;
  return isMac ? mods.join("") + key : [...mods, key].join("+");
}
