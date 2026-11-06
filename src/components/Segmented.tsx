interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Extra class for placement (the `.seg` look is always applied). */
  className?: string;
}

// The `.seg` segmented control (trace-ui §1): one of a few mutually exclusive
// options, e.g. board card density or an Appearance setting.
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
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}
