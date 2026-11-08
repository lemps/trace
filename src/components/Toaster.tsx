import type { ReactNode } from "react";
import { type ToastKind, useToastStore } from "@/app/toast";
import { I } from "./Icon";
import { IconButton } from "./IconButton";

const ICON: Record<ToastKind, (p: { size?: number }) => ReactNode> = {
  success: I.Check,
  error: I.X,
  info: I.Activity,
};

// Floating stack of transient notifications, mounted once in the app shell.
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;

  return (
    <div className="toaster">
      {toasts.map((t) => {
        const Ico = ICON[t.kind];
        return (
          <div key={t.id} className={`toast ${t.kind}`} role="status">
            <span className="toast-ic">
              <Ico size={14} />
            </span>
            <span className="toast-msg">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="btn toast-act"
                onClick={() => {
                  dismiss(t.id);
                  t.action?.run();
                }}
              >
                {t.action.label}
              </button>
            )}
            <IconButton
              size="xs"
              className="ghost toast-x"
              onClick={() => {
                dismiss(t.id);
                t.onDismiss?.();
              }}
              label="Dismiss"
            >
              <I.X size={12} />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
