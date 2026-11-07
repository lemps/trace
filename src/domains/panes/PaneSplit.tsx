import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { usePaneArea } from "./context";
import { minSize, type PaneGroup, type PaneNode, type PaneSplit, setRatio } from "./model";
import { PaneDropOverlay } from "./PaneDropOverlay";
import { PanelSlot } from "./PanelSlot";
import { PaneTabStrip } from "./PaneTabStrip";

/** The least a pane may shrink to by dragging; below the layout's total, the area falls back to one row. */
export const MIN_PANE_W = 360;
export const MIN_PANE_H = 180;
const KEY_STEP = 0.02;

/** A layout node: a pane, or two halves and the divider between them. */
export function PaneNodeView({ node }: { node: PaneNode }) {
  return node.kind === "group" ? <PaneGroupView group={node} /> : <PaneSplitView split={node} />;
}

/**
 * One pane: its tab strip over the shown tab. Pointer or focus anywhere in it —
 * including content portalled in, which React events don't route through here —
 * makes it the focused pane.
 */
export function PaneGroupView({ group }: { group: PaneGroup }) {
  const { panes, narrow, multi, elementFor } = usePaneArea();
  const ref = useRef<HTMLElement>(null);
  const focused = panes.layout.focused === group.id;
  const { apply } = panes;

  useEffect(() => {
    const el = ref.current;
    if (!el || narrow) return;
    const take = () => apply((l) => (l.focused === group.id ? l : { ...l, focused: group.id }));
    el.addEventListener("pointerdown", take, true);
    el.addEventListener("focusin", take);
    return () => {
      el.removeEventListener("pointerdown", take, true);
      el.removeEventListener("focusin", take);
    };
  }, [apply, group.id, narrow]);

  return (
    <section
      ref={ref}
      className={`pn-group${focused && multi && !narrow ? " focused" : ""}`}
      data-group={group.id}
      tabIndex={-1}
    >
      <PaneTabStrip group={group} focused={focused} />
      <div className="pn-body">
        {group.active && <PanelSlot el={elementFor(group.active)} />}
        <PaneDropOverlay groupId={group.id} />
      </div>
    </section>
  );
}

function PaneSplitView({ split }: { split: PaneSplit }) {
  const row = split.dir === "row";
  return (
    <div className={`pn-split ${split.dir}`}>
      <div className="pn-half" style={{ flex: `${split.ratio} 1 0%` }}>
        <PaneNodeView node={split.first} />
      </div>
      <Divider split={split} row={row} />
      <div className="pn-half" style={{ flex: `${1 - split.ratio} 1 0%` }}>
        <PaneNodeView node={split.second} />
      </div>
    </div>
  );
}

/**
 * Drag to resize (each side keeps its minimum), double-click to split evenly, or
 * focus it and use the arrow keys. During a drag only the two halves' styles change;
 * the ratio is saved once, on release.
 */
function Divider({ split, row }: { split: PaneSplit; row: boolean }) {
  const { panes } = usePaneArea();
  const [dragging, setDragging] = useState(false);
  const save = (ratio: number) => panes.apply((l) => setRatio(l, split.id, ratio));
  // A layout change can unmount the divider mid-drag; don't leave the cursor behind.
  useEffect(
    () => () => document.body.classList.remove("pn-resizing-row", "pn-resizing-column"),
    []
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const handle = e.currentTarget;
    const first = handle.previousElementSibling as HTMLElement | null;
    const second = handle.nextElementSibling as HTMLElement | null;
    const box = handle.parentElement?.getBoundingClientRect();
    if (!first || !second || !box) return;
    e.preventDefault();
    const total = row ? box.width : box.height;
    const start = row ? box.left : box.top;
    const need = (n: PaneNode) => {
      const s = minSize(n, MIN_PANE_W, MIN_PANE_H);
      return (row ? s.w : s.h) / total;
    };
    const lo = Math.min(0.5, need(split.first));
    const hi = Math.max(0.5, 1 - need(split.second));
    let ratio = split.ratio;
    handle.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.classList.add(row ? "pn-resizing-row" : "pn-resizing-column");

    const move = (ev: globalThis.PointerEvent) => {
      ratio = Math.min(hi, Math.max(lo, ((row ? ev.clientX : ev.clientY) - start) / total));
      first.style.flex = `${ratio} 1 0%`;
      second.style.flex = `${1 - ratio} 1 0%`;
    };
    const done = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", done);
      handle.removeEventListener("pointercancel", done);
      handle.removeEventListener("lostpointercapture", done);
      document.body.classList.remove("pn-resizing-row", "pn-resizing-column");
      setDragging(false);
      if (ratio !== split.ratio) save(ratio);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", done);
    handle.addEventListener("pointercancel", done);
    handle.addEventListener("lostpointercapture", done);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const less = row ? "ArrowLeft" : "ArrowUp";
    const more = row ? "ArrowRight" : "ArrowDown";
    if (e.key !== less && e.key !== more) return;
    e.preventDefault();
    save(split.ratio + (e.key === more ? KEY_STEP : -KEY_STEP));
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: an interactive separator has no native element
    <div
      role="separator"
      aria-orientation={row ? "vertical" : "horizontal"}
      aria-label="Resize panes"
      aria-valuenow={Math.round(split.ratio * 100)}
      aria-valuemin={10}
      aria-valuemax={90}
      tabIndex={0}
      title="Drag to resize · double-click to split evenly"
      className={`pn-divider ${split.dir}${dragging ? " dragging" : ""}`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => save(0.5)}
      onKeyDown={onKeyDown}
    />
  );
}
