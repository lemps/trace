import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { type PaneArea as AreaCtx, PaneAreaContext } from "./context";
import { allTabs, focusedGroup, listGroups, minSize } from "./model";
import { focusPane } from "./PanelSlot";
import { MIN_PANE_H, MIN_PANE_W, PaneGroupView, PaneNodeView } from "./PaneSplit";
import { usePaneKeys } from "./usePaneKeys";
import type { Panes } from "./usePanes";

/** A pane's tab strip; a pane's minimum height counts it. */
const STRIP_H = 38;

// A detail view's content area: its tabs, arranged in panes (see `model.ts`). Each
// shown tab's content renders once, here, into an element of its own that the pane
// showing it adopts (PanelSlot) — so moving a tab between panes, or between the
// arrangement and the narrow fallback, never remounts it.
//
// When the area is too small for the arrangement's minimum (each pane MIN_PANE_W
// wide, MIN_PANE_H tall), it falls back to one tab row showing the focused pane's
// tab; the arrangement itself is kept and comes back when there's room.
export function PaneArea({ panes }: { panes: Panes }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { layout, panels } = panes;
  const groups = listGroups(layout.root);
  const need = minSize(layout.root, MIN_PANE_W, MIN_PANE_H + STRIP_H);
  const narrow = useTooSmall(rootRef, groups.length > 1 ? need : null);
  const focused = focusedGroup(layout);
  const shown = narrow ? [focused.active] : groups.map((g) => g.active);
  // One row reads in the tabs' own order (agents first), not pane by pane.
  const inLayout = new Set(allTabs(layout));
  const naturalOrder = [...panels.keys()].filter((t) => inLayout.has(t));

  const elements = useRef(new Map<string, HTMLElement>());
  const elementFor = useCallback((tab: string) => {
    let el = elements.current.get(tab);
    if (!el) {
      el = document.createElement("div");
      el.className = "pn-panel";
      elements.current.set(tab, el);
    }
    return el;
  }, []);
  // A hidden tab's content unmounts (as a tab's always has); forget its element.
  const shownKey = shown.join("\n");
  useEffect(() => {
    const keep = new Set(shownKey.split("\n"));
    for (const tab of [...elements.current.keys()]) {
      if (!keep.has(tab)) elements.current.delete(tab);
    }
  }, [shownKey]);

  const focusedId = useRef(layout.focused);
  focusedId.current = layout.focused;
  const focusLater = useCallback(() => {
    requestAnimationFrame(() => {
      const id = CSS.escape(focusedId.current);
      focusPane(rootRef.current?.querySelector(`[data-group="${id}"]`) ?? null);
    });
  }, []);
  usePaneKeys(panes, narrow, focusLater);

  const area = useMemo<AreaCtx>(
    () => ({ panes, narrow, multi: groups.length > 1, elementFor, focusLater }),
    [panes, narrow, groups.length, elementFor, focusLater]
  );

  return (
    <PaneAreaContext.Provider value={area}>
      <div className="pn-area" ref={rootRef}>
        {narrow ? (
          <PaneGroupView group={{ ...focused, tabs: naturalOrder }} />
        ) : (
          <PaneNodeView node={layout.root} />
        )}
      </div>
      {/* After the panes, so their slots have adopted these elements before the
          content's own effects run. */}
      {shown.map((tab) => {
        const panel = panels.get(tab);
        if (!panel) return null;
        return createPortal(
          <ErrorBoundary label={panel.label} inPage>
            {panel.render()}
          </ErrorBoundary>,
          elementFor(tab),
          tab
        );
      })}
    </PaneAreaContext.Provider>
  );
}

/**
 * Whether the element is smaller than `need` (null: nothing to fit). Measured by a
 * ResizeObserver that only re-renders when the answer flips, not on every resize.
 */
function useTooSmall(
  ref: RefObject<HTMLElement | null>,
  need: { w: number; h: number } | null
): boolean {
  const [small, setSmall] = useState(false);
  const w = need?.w ?? 0;
  const h = need?.h ?? 0;
  // Before paint, so a narrow window never flashes the arrangement first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || w === 0) {
      setSmall(false);
      return;
    }
    const check = () => {
      const r = el.getBoundingClientRect();
      setSmall(r.width < w || r.height < h);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, w, h]);
  return small;
}
