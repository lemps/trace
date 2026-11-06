import { activeTheme, useAppearance } from "./store";
import { schemeOf } from "./themes";

/**
 * A string that changes whenever the painted colours do (theme or accent), for
 * surfaces that bake token values in at render — Vega charts, mermaid SVG —
 * to use as a memo/effect dependency.
 */
export function useThemeKey(): string {
  return useAppearance((s) => `${activeTheme(s)}:${s.prefs.accent}`);
}

/** The active theme's light/dark, for libraries that only know those two. */
export function useColorScheme(): "dark" | "light" {
  return useAppearance((s) => schemeOf(activeTheme(s)));
}
