import { type DragEvent, Fragment, type MouseEvent, useRef, useState } from "react";
import { ContextMenu } from "@/components/ContextMenu";
import { I } from "@/components/Icon";
import { PopMenu } from "@/components/PopMenu";
import { fitClass, useTabFit } from "@/components/useTabFit";
import { usePaneArea } from "./context";
import { beginTabDrag, endTabDrag, useTabDrag } from "./drag";
import { insertionIndex } from "./dropZone";
import { closeGroup, moveTab, type PaneGroup, removeTab } from "./model";
import { paneMenu, usePaneHints } from "./paneMenu";

interface Menu {
  tab: string;
  x: number;
  y: number;
}

// One pane's tab row: the same `.detail-tabs` the detail has always had, plus what
// arranging needs — tabs drag (to reorder, to another pane, or to a pane's edge to
// split), right-click for the pane menu, and a ⋯ at the end for the same menu
// without a mouse. The shown tab's own controls (the agent's view switch) sit at the end.
// A narrow pane's tabs are measured to fit (`useTabFit`): icons named by their
// tooltips, then a "more" menu.
export function PaneTabStrip({ group, focused }: { group: PaneGroup; focused: boolean }) {
  const { panes, narrow, multi, focusLater } = usePaneArea();
  const hints = usePaneHints();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [insertAt, setInsertAt] = useState<{ index: number; x: number } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const fit = useTabFit(fitRef, moreRef, group.active);
  const dragging = useTabDrag((s) => s.drag);
  const active = panes.panels.get(group.active);
  const refocus = focusLater;

  const openMenu = (tab: string) => (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // The context-menu key reports no pointer: open under the tab instead.
    const r = e.currentTarget.getBoundingClientRect();
    const keyboard = e.clientX === 0 && e.clientY === 0;
    setMenu({ tab, x: keyboard ? r.left : e.clientX, y: keyboard ? r.bottom : e.clientY });
  };

  // The tabs on show (not those in the "more" menu), and where each sits in the group.
  const shownTabs = () => [
    ...(stripRef.current?.querySelectorAll<HTMLElement>("[data-tab]:not(.fit-out)") ?? []),
  ];
  const tabRects = () => shownTabs().map((el) => el.getBoundingClientRect());
  const groupIndex = (index: number) => {
    const tab = shownTabs()[index]?.dataset.tab;
    return tab === undefined ? group.tabs.length : group.tabs.indexOf(tab);
  };

  const onDragOver = (e: DragEvent) => {
    const drag = useTabDrag.getState().drag;
    if (!drag || drag.scope !== panes.scope || narrow) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rects = tabRects();
    const index = insertionIndex(rects, e.clientX);
    const left = stripRef.current?.getBoundingClientRect().left ?? 0;
    const edge =
      index < rects.length ? rects[index].left : (rects[rects.length - 1]?.right ?? left);
    setInsertAt({ index, x: edge - left });
  };
  const onDrop = (e: DragEvent) => {
    const drag = useTabDrag.getState().drag;
    setInsertAt(null);
    if (!drag || drag.scope !== panes.scope || narrow) return;
    e.preventDefault();
    const index = groupIndex(insertionIndex(tabRects(), e.clientX));
    panes.apply((l) => moveTab(l, drag.tab, group.id, index));
    endTabDrag();
    refocus();
  };
  const onDragLeave = (e: DragEvent) => {
    if (!stripRef.current?.contains(e.relatedTarget as Node | null)) setInsertAt(null);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target; tabs are its buttons
    <div
      ref={stripRef}
      className={`detail-tabs pn-strip${focused && multi && !narrow ? " focused" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="tab-fit" ref={fitRef}>
        {group.tabs.map((tab, i) => {
          const panel = panes.panels.get(tab);
          if (!panel) return null;
          const Icon = panel.icon;
          const isDragged = dragging?.tab === tab && dragging.scope === panes.scope;
          const mode = fit.mode(tab);
          const out = mode === "out";
          return (
            <Fragment key={tab}>
              {i > 0 && panel.section !== panes.panels.get(group.tabs[i - 1])?.section && (
                <span className={`detail-tab-sep${fitClass(mode)}`} data-fit-of={tab} />
              )}
              <button
                type="button"
                data-tab={tab}
                data-fit-tab={tab}
                className={`detail-tab${tab === group.active ? " active" : ""}${isDragged ? " dragged" : ""}${fitClass(mode)}`}
                title={panel.title ?? panel.label}
                aria-label={panel.label}
                aria-hidden={out || undefined}
                tabIndex={out ? -1 : undefined}
                draggable={!narrow && !out}
                onClick={() => panes.select(tab)}
                onContextMenu={openMenu(tab)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", panel.label);
                  beginTabDrag({ scope: panes.scope, tab });
                }}
                onDragEnd={() => {
                  setInsertAt(null);
                  endTabDrag();
                }}
              >
                <Icon size={13} />
                <span className="pn-tab-label" data-fit-label>
                  {panel.label}
                </span>
                {panel.badge}
              </button>
              {(panel.optional || panel.onClose) && (
                <button
                  type="button"
                  className={`pn-tab-close${fitClass(mode)}`}
                  data-fit-of={tab}
                  tabIndex={out ? -1 : undefined}
                  aria-label={`Close ${panel.label}`}
                  title={`Close ${panel.label}`}
                  onClick={() =>
                    panel.onClose ? panel.onClose() : panes.apply((l) => removeTab(l, tab))
                  }
                >
                  <I.X size={11} />
                </button>
              )}
              {panel.after}
            </Fragment>
          );
        })}
      </div>
      {fit.out.length > 0 && (
        <div className="tab-fit-more" ref={moreRef}>
          <PopMenu
            align="right"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                className={`detail-tab pn-more${open ? " active" : ""}`}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
              >
                {fit.out.length} more <I.Chevron size={11} />
              </button>
            )}
            sections={[
              {
                items: fit.out.flatMap((tab) => {
                  const panel = panes.panels.get(tab);
                  return panel
                    ? [{ id: tab, label: panel.label, onSelect: () => panes.select(tab) }]
                    : [];
                }),
              },
            ]}
          />
        </div>
      )}
      {insertAt && <span className="pn-insert" style={{ left: insertAt.x }} />}
      <div className="pn-strip-end">
        {active?.toolbar}
        {/* A pane holding only a closable panel: its tab's × already closes both. */}
        {multi && !narrow && !(group.tabs.length === 1 && active?.optional) && (
          <button
            type="button"
            className="btn ghost icon pn-act"
            aria-label="Close pane"
            title="Close pane — its tabs join the pane beside it"
            onClick={() => panes.apply((l) => closeGroup(l, group.id))}
          >
            <I.X size={13} />
          </button>
        )}
        <PopMenu
          trigger={({ toggle }) => (
            <button
              type="button"
              className="btn ghost icon pn-act"
              aria-label="Pane actions"
              title="Split, move or close this pane"
              onClick={toggle}
            >
              <I.More size={14} />
            </button>
          )}
          sections={paneMenu(panes, group.active, hints, narrow, refocus)}
        />
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sections={paneMenu(panes, menu.tab, hints, narrow, refocus)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
