import { type DragEvent, useState } from "react";
import { usePaneArea } from "./context";
import { endTabDrag, useTabDrag } from "./drag";
import { type DropZone, resolveDropZone } from "./dropZone";
import { canSplit, groupOf, moveTab, splitTab } from "./model";

// Laid over a pane's content while a tab is dragged: the edge the pointer is near
// lights up where a new pane would open, the middle lights the whole pane (the tab
// joins its tabs). A drop that wouldn't change anything lights nothing.
export function PaneDropOverlay({ groupId }: { groupId: string }) {
  const { panes, narrow, focusLater } = usePaneArea();
  const drag = useTabDrag((s) => s.drag);
  const [zone, setZone] = useState<DropZone | null>(null);
  if (!drag || drag.scope !== panes.scope || narrow) return null;

  const allowed = (z: DropZone) =>
    z === "center"
      ? groupOf(panes.layout, drag.tab)?.id !== groupId
      : canSplit(panes.layout, drag.tab, groupId);
  const zoneAt = (e: DragEvent): DropZone | null => {
    const z = resolveDropZone(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
    return allowed(z) ? z : null;
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target, there only mid-drag
    <div
      className="pn-drop"
      onDragOver={(e) => {
        const z = zoneAt(e);
        setZone(z);
        if (!z) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={() => setZone(null)}
      onDrop={(e) => {
        const z = zoneAt(e);
        setZone(null);
        if (!z) return;
        e.preventDefault();
        const { tab } = drag;
        panes.apply((l) =>
          z === "center" ? moveTab(l, tab, groupId) : splitTab(l, tab, groupId, z)
        );
        endTabDrag();
        focusLater();
      }}
    >
      {zone && <div className={`pn-drop-hint ${zone}`} />}
    </div>
  );
}
