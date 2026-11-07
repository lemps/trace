// Which suggested fonts this machine has, so the font pickers only offer ones that
// will show. The webview can't list installed fonts without a permission prompt,
// so each name is measured instead: drawn text that keeps a fallback's width
// means the font is missing and the fallback was used.

/** Generic families every webview resolves; always offered. */
const GENERIC = new Set(["system-ui", "ui-sans-serif", "ui-monospace", "monospace", "sans-serif"]);

const SAMPLE = "mmmmmmmmmmlli1WW@#";
const FALLBACKS = ["monospace", "serif", "sans-serif"];

let ctx: CanvasRenderingContext2D | null | undefined;

function widthIn(font: string): number | null {
  if (ctx === undefined) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.font = `72px ${font}`;
  return ctx.measureText(SAMPLE).width;
}

/** Whether `family` renders on this machine (true when it can't tell). */
export function isFontInstalled(family: string): boolean {
  if (GENERIC.has(family)) return true;
  return FALLBACKS.some((fallback) => {
    const base = widthIn(fallback);
    const withFont = widthIn(`"${family}", ${fallback}`);
    return base === null || withFont === null || withFont !== base;
  });
}

/** The suggestions this machine can show, in their given order. */
export function installedOnly(families: string[]): string[] {
  return families.filter(isFontInstalled);
}

/** Interface font suggestions across macOS, Windows and Linux. */
export const UI_FONT_SUGGESTIONS = [
  "Geist",
  "Inter",
  "Segoe UI Variable Text",
  "Segoe UI",
  "SF Pro Text",
  "Helvetica Neue",
  "Roboto",
  "Ubuntu",
  "Noto Sans",
  "Arial",
  "system-ui",
];

/** Monospace suggestions for the terminal across macOS, Windows and Linux. */
export const MONO_FONT_SUGGESTIONS = [
  "Geist Mono",
  "JetBrains Mono",
  "Cascadia Code",
  "Cascadia Mono",
  "Fira Code",
  "SF Mono",
  "Menlo",
  "Monaco",
  "Consolas",
  "Ubuntu Mono",
  "DejaVu Sans Mono",
  "ui-monospace",
];
