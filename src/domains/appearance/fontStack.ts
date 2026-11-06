// One rule for turning a font family as typed into a CSS font stack, shared by
// the UI font (Appearance) and the terminal font (agent/terminalPrefs).

const GENERIC = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

/**
 * The typed families in front of `fallback`, or "" when nothing usable was
 * typed. Inputs apply on every keystroke, so a half-typed value ("Inter,",
 * an unclosed quote) must still give valid CSS: each comma-separated name is
 * trimmed, stripped of quotes and CSS punctuation, re-quoted unless it's a
 * generic family, and empty names are dropped. The fallback always follows,
 * so missing glyphs still land on something sane.
 */
export function fontStack(raw: string, fallback: string): string {
  const names = raw
    .split(",")
    .map((n) => n.replace(/["';{}\\]/g, "").trim())
    .filter(Boolean)
    .map((n) => (GENERIC.has(n.toLowerCase()) ? n : `"${n}"`));
  return names.length > 0 ? `${names.join(", ")}, ${fallback}` : "";
}
