import { create } from "zustand";

// The tab being dragged, if any. HTML5 drag events can't carry typed payloads
// reliably across webviews (see sessions/dragState.ts), so the source records itself
// here and the targets read it. While it's set, every pane shows its drop overlay —
// covering terminals and iframes, which would otherwise swallow the drag.

export interface TabDrag {
  scope: string;
  tab: string;
}

interface DragStore {
  drag: TabDrag | null;
  set: (drag: TabDrag | null) => void;
}

export const useTabDrag = create<DragStore>((set) => ({
  drag: null,
  set: (drag) => set({ drag }),
}));

/** Start dragging a tab. Deferred a tick: changing the DOM inside dragstart can cancel the drag. */
export function beginTabDrag(drag: TabDrag): void {
  setTimeout(() => {
    useTabDrag.getState().set(drag);
    // A tab moved by its own drop is a new node, so its dragend can be lost. No
    // mouse moves during a drag; the first one after it means it's over.
    window.addEventListener("mousemove", () => useTabDrag.getState().set(null), { once: true });
  }, 0);
}

export function endTabDrag(): void {
  // After a drop's own handler, which reads it.
  setTimeout(() => useTabDrag.getState().set(null), 0);
}
