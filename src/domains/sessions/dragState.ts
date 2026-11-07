import { useSyncExternalStore } from "react";

// What's being dragged on the Sessions page. HTML5 drag events can't carry
// typed payloads reliably across WKWebView, so sources record themselves here
// (same pattern as the board's draggingRef) and targets read it on drop.
export type SessionsDrag = { kind: "session" | "section" | "tab"; id: string };

export const sessionsDrag: { current: SessionsDrag | null } = { current: null };

// Whether a session row is mid-drag, for lists that hold their order still
// meanwhile. Set by the row on drag start and end (end fires wherever it drops).
let rowDragging = false;
const listeners = new Set<() => void>();

export function setRowDragging(on: boolean): void {
  if (rowDragging === on) return;
  rowDragging = on;
  for (const l of listeners) l();
  // A row dropped into another list unmounts, and then never gets its dragend:
  // any drop or drag end on the page ends it too (after the drop handlers run).
  if (on) {
    const end = () => {
      window.removeEventListener("drop", end, true);
      window.removeEventListener("dragend", end, true);
      setTimeout(() => setRowDragging(false), 0);
    };
    window.addEventListener("drop", end, true);
    window.addEventListener("dragend", end, true);
  }
}

export function useRowDragging(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => rowDragging
  );
}
