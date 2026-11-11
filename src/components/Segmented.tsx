import type { ReactNode } from "react";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** An icon option's tooltip and accessible name (a text option needs none). */
  name?: string;
  /** A worded option's tooltip, only for a *why* or a caveat the label can't carry. */
  title?: string;
}

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Extra class for placement (the `.seg` look is always applied). */
  className?: string;
}

// The `.seg` segmented control (trace-ui §1; segmented.css): one of a few mutually
// exclusive options, e.g. board card density or an Appearance setting. Options can
// be icons, each named (the gallery viewer's One / Side by side / Swipe).
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  return (
    <fieldset className={className ? `seg ${className}` : "seg"} aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          className={value === o.value ? "on" : undefined}
          title={o.title ?? o.name}
          aria-label={o.name}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}
