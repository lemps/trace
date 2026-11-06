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

/** Which theme "system" means for each OS preference. */
const SYSTEM_THEME: Record<ColorScheme, ThemeId> = { dark: "dark", light: "light" };

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "system" || THEMES.some((t) => t.id === v);
}

export function resolveTheme(choice: ThemeChoice, system: ColorScheme): ThemeId {
  return choice === "system" ? SYSTEM_THEME[system] : choice;
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
