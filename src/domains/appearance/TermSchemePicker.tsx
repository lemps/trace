import { termColors } from "./ansi";
import { TermSnippet, THUMB_LINES } from "./previews/TerminalPreview";
import { activeTheme, useAppearance } from "./store";
import { resolveTermScheme, TERM_SCHEMES, type TermSchemeChoice } from "./terminalSchemes";
import { themeLabel } from "./themes";

// The terminal colour schemes as thumbnails: each draws two sample lines and
// six of its ANSI colours, so a scheme is picked by how it looks.
// "Match theme" shows, and names, whichever scheme the current app theme picks.
// The sample is a picture (aria-hidden): a card's name is its label alone.

const CHOICES: { id: TermSchemeChoice; label: string }[] = [
  { id: "match", label: "Match theme" },
  ...TERM_SCHEMES.map((s) => ({ id: s.id, label: s.label })),
];

const NORMAL = ["red", "green", "yellow", "blue", "magenta", "cyan"] as const;

export function TermSchemePicker() {
  const choice = useAppearance((s) => s.prefs.termScheme);
  const theme = useAppearance(activeTheme);
  const update = useAppearance((s) => s.update);
  return (
    <fieldset className="ap-thumbs" aria-label="Terminal colour scheme">
      {CHOICES.map((c) => {
        const scheme = resolveTermScheme(c.id, theme);
        const { ansi } = termColors(scheme.theme);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={choice === c.id}
            className={`ap-thumb${choice === c.id ? " on" : ""}`}
            onClick={() => update({ termScheme: c.id })}
          >
            <span className="ap-thumb-pic" aria-hidden="true">
              <TermSnippet scheme={scheme} lines={THUMB_LINES}>
                <span className="ap-term-dots">
                  {NORMAL.map((n) => (
                    <i key={n} style={{ background: ansi[n] }} />
                  ))}
                </span>
              </TermSnippet>
            </span>
            <span className="ap-thumb-name">
              {c.id === "match" ? `${c.label} · ${themeLabel(theme)}` : c.label}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
