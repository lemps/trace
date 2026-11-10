import { IconButton } from "./IconButton";
import { MenuCaret } from "./MenuCaret";
import { PopMenu } from "./PopMenu";

interface FontFieldProps {
  /** What's typed: a family, or a comma-separated stack. "" means the default. */
  value: string;
  onChange: (next: string) => void;
  /** Families to offer, each shown in its own face. */
  suggestions: string[];
  /** The family a blank value falls back to, for the placeholder and Default item. */
  defaultFamily: string;
  label: string;
}

// A font box that takes any family typed into it, plus a button listing every
// suggestion. A <datalist> did this before, but Chromium only lists the options
// matching the current text, so once a font was picked nothing else showed.
export function FontField({ value, onChange, suggestions, defaultFamily, label }: FontFieldProps) {
  const current = value.trim();
  const items = [
    {
      id: "default",
      label: <span style={{ fontFamily: `"${defaultFamily}"` }}>Default ({defaultFamily})</span>,
      checked: current === "",
      onSelect: () => onChange(""),
    },
    ...suggestions.map((family) => ({
      id: family,
      label: <span style={{ fontFamily: `"${family}"` }}>{family}</span>,
      checked: current.toLowerCase() === family.toLowerCase(),
      onSelect: () => onChange(family),
    })),
  ];
  return (
    <div className="font-field">
      <input
        type="text"
        aria-label={label}
        placeholder={defaultFamily}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <PopMenu
        align="right"
        trigger={({ open, toggle }) => (
          <IconButton
            label={`Choose ${label.toLowerCase()}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={toggle}
          >
            <MenuCaret />
          </IconButton>
        )}
        sections={[{ items }]}
      />
    </div>
  );
}
