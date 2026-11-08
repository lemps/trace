import { create } from "zustand";

// Transient, app-global notifications (e.g. board move succeeded / failed). Kept
// here in the app shell rather than a domain because any feature can raise one.

export type ToastKind = "success" | "error" | "info";

/** A button on a toast; using it also closes the toast. */
export interface ToastAction {
  label: string;
  run: () => void;
}

/** Extras for a notice: an action, and what to do when the user closes it with ×. */
export interface ToastOptions {
  action?: ToastAction;
  /** Only the user's ×, not the toast timing out or its action being used. */
  onDismiss?: () => void;
}

export interface Toast extends ToastOptions {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

// Monotonic id — module-level so it survives store re-creation in dev HMR.
let nextId = 1;

// Errors linger longer (they're actionable); success/info auto-clear quickly.
const TTL: Record<ToastKind, number> = { error: 7000, success: 3000, info: 4000 };
// A toast with an action stays long enough to read and reach.
const ACTION_TTL = 12000;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push(kind, message, options) {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, ...options }] }));
    const ttl = options?.action ? ACTION_TTL : TTL[kind];
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ttl);
    return id;
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

// Imperative helpers for non-component code (stores, async handlers).
export const toast = {
  success: (message: string) => useToastStore.getState().push("success", message),
  error: (message: string) => useToastStore.getState().push("error", message),
  info: (message: string) => useToastStore.getState().push("info", message),
  /** A quiet info toast with an action (e.g. "Details"), for something worth a look. */
  notice: (message: string, options: ToastOptions) =>
    useToastStore.getState().push("info", message, options),
};

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
