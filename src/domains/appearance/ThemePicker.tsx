import type { CSSProperties } from "react";
import { useAppearance } from "./store";
import { ACCENTS, THEMES, type ThemeChoice, type ThemeId } from "./themes";

// The theme cards and accent swatches. Each card's preview carries its own
// data-theme, so it is drawn with that theme's real tokens, not a screenshot
// or a copied palette — a token change shows up here for free.

function Preview({ theme }: { theme: ThemeId }) {
  return (
    <span className="ap-pv" data-theme={theme}>
      <span className="ap-pv-rail" />
      <span className="ap-pv-main">
        <span className="ap-pv-card">
          <i className="ap-pv-dot needs" />
          <b />
        </span>
        <span className="ap-pv-card">
          <i className="ap-pv-dot ready" />
          <b className="short" />
        </span>
        <span className="ap-pv-accent" />
      </span>
    </span>
  );
}

const CHOICES: { id: ThemeChoice; label: string; blurb: string }[] = [
  { id: "system", label: "System", blurb: "Dark or Light, following the OS." },
  ...THEMES,
];

export function ThemePicker() {
  const theme = useAppearance((s) => s.prefs.theme);
  const update = useAppearance((s) => s.update);
  return (
    <fieldset className="ap-themes" aria-label="Theme">
      {CHOICES.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={theme === c.id}
          className={`ap-theme${theme === c.id ? " on" : ""}`}
          onClick={() => update({ theme: c.id })}
        >
          {c.id === "system" ? (
            <span className="ap-pv-split">
              <Preview theme="dark" />
              <Preview theme="light" />
            </span>
          ) : (
            <Preview theme={c.id} />
          )}
          <span className="ap-theme-name">{c.label}</span>
          <span className="ap-theme-blurb">{c.blurb}</span>
        </button>
      ))}
    </fieldset>
  );
}

export function AccentPicker() {
  const accent = useAppearance((s) => s.prefs.accent);
  const update = useAppearance((s) => s.update);
  return (
    <fieldset className="ap-swatches" aria-label="Accent colour">
      {ACCENTS.map((a) => (
        <button
          key={a.id}
          type="button"
          aria-pressed={accent === a.id}
          aria-label={a.label}
          title={a.label}
          className={`ap-swatch${accent === a.id ? " on" : ""}`}
          // The hue is data; lightness and chroma come from the theme (--accent-l/-c).
          style={{ "--swatch-h": a.hue, "--swatch-sat": a.sat } as CSSProperties}
          onClick={() => update({ accent: a.id })}
        />
      ))}
    </fieldset>
  );
}
