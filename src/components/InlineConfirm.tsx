import { type ReactNode, useEffect, useRef, useState } from "react";

interface InlineConfirmProps {
  /** The trigger's content: a word ("Clear"), or an icon with `ariaLabel`. */
  label: ReactNode;
  /** What confirming will do, in one short sentence beside Cancel / Confirm. */
  message: ReactNode;
  /** The destructive button's word ("Clear", "Remove", "Reset"). */
  confirmLabel: ReactNode;
  onConfirm: () => void;
  /** The trigger's class; defaults to a plain `.btn`. */
  className?: string;
  title?: string;
  /** For an icon-only trigger. */
  ariaLabel?: string;
  disabled?: boolean;
}

// A destructive action, confirmed in place (trace-ui §5: inline, never a dialog).
// Clicking the trigger swaps it for the message plus Cancel / Confirm; Cancel,
// Escape or confirming puts the trigger back. Cancel takes focus, so a stray
// Enter or Space doesn't confirm.
export function InlineConfirm({
  label,
  message,
  confirmLabel,
  onConfirm,
  className = "btn",
  title,
  ariaLabel,
  disabled,
}: InlineConfirmProps) {
  const [armed, setArmed] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (armed) cancelRef.current?.focus();
  }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        className={className}
        title={title}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {label}
      </button>
    );
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape from either button cancels
    <span
      className="inline-confirm"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        setArmed(false);
      }}
    >
      <span className="inline-confirm-msg">{message}</span>
      <button type="button" className="btn" ref={cancelRef} onClick={() => setArmed(false)}>
        Cancel
      </button>
      <button
        type="button"
        className="btn danger"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
    </span>
  );
}
