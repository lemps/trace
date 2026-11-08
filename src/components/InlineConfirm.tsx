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
  /** The trigger's tooltip, only for a *why*; an icon-only trigger defaults to `ariaLabel`. */
  title?: string;
  /** For an icon-only trigger (`className="btn icon …"`): its name, and its tooltip. */
  ariaLabel?: string;
  disabled?: boolean;
}

// A destructive action, confirmed in place (trace-ui §5: inline, never a dialog).
// Clicking the trigger swaps it for the message plus Cancel / Confirm; Cancel,
// Escape or confirming puts the trigger back.
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

  if (!armed) {
    return (
      <button
        type="button"
        className={className}
        title={title ?? ariaLabel}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <ConfirmPrompt
      message={message}
      confirmLabel={confirmLabel}
      onCancel={() => setArmed(false)}
      onConfirm={() => {
        setArmed(false);
        onConfirm();
      }}
    />
  );
}

interface ConfirmPromptProps {
  message: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The armed half of `InlineConfirm`, for a destructive action whose trigger isn't a
 * button in place (a menu item): the message plus Cancel / Confirm. Cancel takes
 * focus, so a stray Enter or Space doesn't confirm; Escape cancels.
 */
export function ConfirmPrompt({ message, confirmLabel, onConfirm, onCancel }: ConfirmPromptProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape from either button cancels
    <span
      className="inline-confirm"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onCancel();
      }}
    >
      <span className="inline-confirm-msg">{message}</span>
      <button type="button" className="btn" ref={cancelRef} onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="btn danger" onClick={onConfirm}>
        {confirmLabel}
      </button>
    </span>
  );
}
