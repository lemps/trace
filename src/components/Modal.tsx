import { type ReactNode, useEffect } from "react";
import { I } from "./Icon";
import { IconButton } from "./IconButton";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra class on the dialog, for a modal that needs a different width. */
  className?: string;
}

// Shared centered modal: backdrop click and Escape both close it.
export function Modal({ title, onClose, children, footer, className }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-scrim; Escape closes via the window listener above
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-scrim; Escape closes via the window listener above
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={className ? `modal ${className}` : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <IconButton size="sm" className="ghost modal-x" onClick={onClose} label="Close">
            <I.X size={14} />
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
