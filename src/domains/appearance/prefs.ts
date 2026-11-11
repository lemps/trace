import { type ChatStyle, DEFAULT_CHAT_STYLE, parseChatStyle } from "./chatStyle.ts";
import { isTermSchemeChoice, type TermSchemeChoice } from "./terminalSchemes.ts";
import {
  type AccentId,
  type DarkThemeId,
  DEFAULT_ACCENT,
  DEFAULT_SYSTEM_THEMES,
  isAccentId,
  isDarkThemeId,
  isLightThemeId,
  isThemeChoice,
  type LightThemeId,
  type SystemThemes,
  type ThemeChoice,
} from "./themes.ts";

// The persisted Appearance settings: their shape, defaults, and a validating
// load (localStorage is user-editable, so nothing is trusted by cast).
// The terminal's font, size, line height and scrollback are older and keep their
// own keys (agent/terminalPrefs.ts); Appearance is still the one page that edits them.

export type Density = "compact" | "standard" | "comfortable";
export type CursorStyle = "block" | "bar" | "underline";
/** "system" follows the OS reduce-motion setting; "reduce" forces it on. */
export type MotionPref = "system" | "reduce";

export interface AppearancePrefs {
  theme: ThemeChoice;
  /** The theme "System" uses while the OS is light. */
  lightTheme: LightThemeId;
  /** The theme "System" uses while the OS is dark. */
  darkTheme: DarkThemeId;
  accent: AccentId;
  density: Density;
  /** A UI font family as typed ("" = Geist). */
  uiFont: string;
  /**
   * The app's code font as typed ("" = Geist Mono): --font-mono, so ids, keys,
   * diffs and the Files tab, and the default for the chat's code and the terminal.
   */
  monoFont: string;
  /** Whole-interface zoom, in percent. */
  uiScale: number;
  termScheme: TermSchemeChoice;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  motion: MotionPref;
  /** How agent Markdown reads in the chat and transcript (chatStyle.ts). */
  chat: ChatStyle;
}

/** The Interface size steps, smallest first; the zoom shortcuts walk them too (zoom.ts). */
export const UI_SCALES = [80, 90, 100, 110, 125, 150] as const;

export const DEFAULT_PREFS: AppearancePrefs = {
  theme: "dark",
  lightTheme: DEFAULT_SYSTEM_THEMES.light,
  darkTheme: DEFAULT_SYSTEM_THEMES.dark,
  accent: DEFAULT_ACCENT,
  density: "standard",
  uiFont: "",
  monoFont: "",
  uiScale: 100,
  termScheme: "match",
  cursorStyle: "block",
  cursorBlink: true,
  motion: "system",
  chat: DEFAULT_CHAT_STYLE,
};

const KEY = "trace.appearance";

function pick<T>(v: unknown, ok: (v: unknown) => v is T, fallback: T): T {
  return ok(v) ? v : fallback;
}

const isDensity = (v: unknown): v is Density =>
  v === "compact" || v === "standard" || v === "comfortable";
const isCursor = (v: unknown): v is CursorStyle =>
  v === "block" || v === "bar" || v === "underline";
const isMotion = (v: unknown): v is MotionPref => v === "system" || v === "reduce";
const isScale = (v: unknown): v is number => UI_SCALES.some((s) => s === v);
const isString = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Validate a stored value field by field; anything unknown falls back to its default. */
export function parsePrefs(raw: unknown): AppearancePrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_PREFS;
  return {
    theme: pick(o.theme, isThemeChoice, d.theme),
    lightTheme: pick(o.lightTheme, isLightThemeId, d.lightTheme),
    darkTheme: pick(o.darkTheme, isDarkThemeId, d.darkTheme),
    accent: pick(o.accent, isAccentId, d.accent),
    density: pick(o.density, isDensity, d.density),
    uiFont: pick(o.uiFont, isString, d.uiFont).slice(0, 200),
    monoFont: pick(o.monoFont, isString, d.monoFont).slice(0, 200),
    uiScale: pick(o.uiScale, isScale, d.uiScale),
    termScheme: pick(o.termScheme, isTermSchemeChoice, d.termScheme),
    cursorStyle: pick(o.cursorStyle, isCursor, d.cursorStyle),
    cursorBlink: pick(o.cursorBlink, isBool, d.cursorBlink),
    motion: pick(o.motion, isMotion, d.motion),
    chat: parseChatStyle(o.chat),
  };
}

/** What "System" resolves to, from the prefs. */
export function systemThemes(p: AppearancePrefs): SystemThemes {
  return { light: p.lightTheme, dark: p.darkTheme };
}

export function loadPrefs(): AppearancePrefs {
  try {
    const s = localStorage.getItem(KEY);
    return parsePrefs(s ? JSON.parse(s) : null);
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: AppearancePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // best-effort persistence, like the app's other view prefs
  }
}
