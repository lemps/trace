// The app themes and accent colours offered in Settings → Appearance. A theme's
// colours live in CSS (tokens.css for Dark, themes.css for the rest), keyed by
// `data-theme`; this module only names them and says which are light.

export type ThemeId = "dark" | "light" | "midnight" | "paper";
/** What the user picked: a theme, or "system" to follow the OS light/dark. */
export type ThemeChoice = ThemeId | "system";
export type ColorScheme = "dark" | "light";

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  scheme: ColorScheme;
  blurb: string;
}

export const THEMES: ThemeInfo[] = [
  { id: "dark", label: "Dark", scheme: "dark", blurb: "trace's original near-black." },
  { id: "light", label: "Light", scheme: "light", blurb: "Neutral greys on white." },
  { id: "midnight", label: "Midnight", scheme: "dark", blurb: "Deep navy, softer than black." },
  { id: "paper", label: "Paper", scheme: "light", blurb: "Warm and low-glare." },
];

/** A light theme, for "System" while the OS is light. */
export type LightThemeId = "light" | "paper";
/** A dark theme, for "System" while the OS is dark. */
export type DarkThemeId = "dark" | "midnight";

/** Which theme "System" uses for each OS mode (Settings → Appearance → Theme). */
export interface SystemThemes {
  light: LightThemeId;
  dark: DarkThemeId;
}

/** The picks before anyone chose: what "System" always meant. */
export const DEFAULT_SYSTEM_THEMES: SystemThemes = { light: "light", dark: "dark" };

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "system" || THEMES.some((t) => t.id === v);
}

export const isLightThemeId = (v: unknown): v is LightThemeId => v === "light" || v === "paper";
export const isDarkThemeId = (v: unknown): v is DarkThemeId => v === "dark" || v === "midnight";

/** The theme on screen: a picked theme, or "System"'s pick for the OS's mode now. */
export function resolveTheme(
  choice: ThemeChoice,
  system: ColorScheme,
  picks: SystemThemes = DEFAULT_SYSTEM_THEMES
): ThemeId {
  return choice === "system" ? picks[system] : choice;
}

export function themeLabel(id: ThemeId): string {
  return THEMES.find((t) => t.id === id)?.label ?? id;
}

export function schemeOf(id: ThemeId): ColorScheme {
  return THEMES.find((t) => t.id === id)?.scheme ?? "dark";
}

/**
 * Accent hues. Amber, blue and green are left out on purpose: colour means
 * agent state in trace (trace-ui §2), so the brand accent must never read as it.
 * Lightness and chroma come from the theme, so each stays legible on it;
 * `sat` scales the chroma (Graphite is the theme's accent with no colour).
 */
export const ACCENTS = [
  { id: "violet", label: "Violet", hue: 290, sat: 1 },
  { id: "orchid", label: "Orchid", hue: 318, sat: 1 },
  { id: "rose", label: "Rose", hue: 350, sat: 1 },
  { id: "graphite", label: "Graphite", hue: 290, sat: 0 },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export const DEFAULT_ACCENT: AccentId = "violet";

export function isAccentId(v: unknown): v is AccentId {
  return ACCENTS.some((a) => a.id === v);
}

export function accentOf(id: AccentId): (typeof ACCENTS)[number] {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}
