import { useState } from "react";
import { sizeFromInput } from "./chatStyle";

interface SizeFieldProps {
  label: string;
  /** The applied size in px; 0 is the default (a blank box). */
  value: number;
  range: { min: number; max: number };
  onChange: (px: number) => void;
}

/**
 * A px size typed freely (Appearance's chat and terminal sizes). What's typed
 * is a draft until Enter or blur, so "16" doesn't apply "1" on the way; a blank
 * or in-range value is then applied, and anything else stays in the box marked
 * invalid (`aria-invalid`) without applying. Escape restores the applied value.
 */
export function SizeField({ label, value, range, onChange }: SizeFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && sizeFromInput(draft, range) === null;
  const commit = () => {
    if (draft === null) return;
    const next = sizeFromInput(draft, range);
    if (next === null) return;
    setDraft(null);
    if (next !== value) onChange(next);
  };
  return (
    <input
      type="number"
      aria-label={label}
      aria-invalid={invalid}
      min={range.min}
      max={range.max}
      step={0.5}
      placeholder="Default"
      value={draft ?? (value ? String(value) : "")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape" && draft !== null) {
          e.preventDefault();
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
