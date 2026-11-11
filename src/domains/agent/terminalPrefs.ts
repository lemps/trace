// Terminal presentation preferences (font, size, line height, scrollback)
// configured in Settings, read from localStorage so the Settings UI and the live
// terminals in `terminalRegistry` share one source of truth. Their ranges,
// presets and parsing are in `appearance/terminalOptions.ts`.

import { fontStack } from "@/domains/appearance/fontStack";
import {
  DEFAULT_TERM_FONT_SIZE,
  parseScrollback,
  parseTermLineHeight,
  parseTermSize,
} from "@/domains/appearance/terminalOptions";

const FONT_KEY = "trace.termFontFamily";
const SIZE_KEY = "trace.termFontSize";
const LINE_HEIGHT_KEY = "trace.termLineHeight";
const SCROLLBACK_KEY = "trace.termScrollback";

// xterm paints to a canvas and can't resolve CSS variables, so this mirrors
// tokens.css --font-mono-default. A chosen font (the terminal's own, else the
// app's code font) is *prepended* to this stack so missing glyphs (box drawing,
// powerline) still fall back to something sane.
export const DEFAULT_TERM_FONT_STACK =
  '"Geist Mono", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // localStorage can be unavailable in sandboxed contexts — keep the
    // in-memory value and silently skip persistence.
  }
}

/** The terminal's own font as typed, for the Settings input ("" = the app's code font). */
export function termFontRaw(): string {
  return read(FONT_KEY);
}

/**
 * The effective xterm font stack: the terminal's own font, or else the app's
 * code font (Appearance → Interface → Code font), in front of the defaults.
 */
export function termFontFamily(codeFont: string): string {
  const chosen = termFontRaw().trim() || codeFont;
  return fontStack(chosen, DEFAULT_TERM_FONT_STACK) || DEFAULT_TERM_FONT_STACK;
}

export function setTermFont(next: string) {
  write(FONT_KEY, next.trim());
}

/** The size setting in px, 0 for the default. */
export function termFontSizeSetting(): number {
  return parseTermSize(read(SIZE_KEY));
}

/** The size the terminal draws at. */
export function termFontSize(): number {
  return termFontSizeSetting() || DEFAULT_TERM_FONT_SIZE;
}

/** Save a size in px (0 = the default). */
export function setTermFontSize(px: number) {
  write(SIZE_KEY, px ? String(px) : "");
}

/** The line height: one of the presets (an older free value reads as the nearest). */
export function termLineHeight(): number {
  return parseTermLineHeight(read(LINE_HEIGHT_KEY));
}

export function setTermLineHeight(next: number) {
  write(LINE_HEIGHT_KEY, String(next));
}

/** Lines of scrollback each terminal keeps. */
export function termScrollback(): number {
  return parseScrollback(read(SCROLLBACK_KEY));
}

export function setTermScrollback(lines: number) {
  write(SCROLLBACK_KEY, String(lines));
}

/** Back to the defaults (Appearance's Terminal reset and Reset appearance). */
export function resetTermPrefs() {
  for (const key of [FONT_KEY, SIZE_KEY, LINE_HEIGHT_KEY, SCROLLBACK_KEY]) write(key, "");
}
