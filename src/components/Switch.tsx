interface SwitchProps {
  on: boolean;
  onChange: (on: boolean) => void;
  /** Accessible name — the visual label lives in the surrounding setting-row. */
  label: string;
  /** Shown but not changeable (e.g. a setting the OS is forcing). */
  disabled?: boolean;
}

// iOS-style toggle from the design (.switch / .switch.on).
export function Switch({ on, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      className={`switch${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
    />
  );
}
