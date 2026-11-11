import { type DragEvent, Fragment, useRef, useState } from "react";
import { ContextMenu } from "@/components/ContextMenu";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { MoreTrigger, PopMenu } from "@/components/PopMenu";
import { TabMore } from "@/components/TabMore";
import { useContextMenuAt } from "@/components/useContextMenuAt";
import { fitClass, useTabFit } from "@/components/useTabFit";
import { useNumberedAriaKeys, useNumberedHints } from "@/platform/shortcuts";
import { usePaneArea } from "./context";
import { beginTabDrag, endTabDrag, useTabDrag } from "./drag";
import { insertionIndex } from "./dropZone";
import { closeGroup, moveTab, type PaneGroup, removeTab } from "./model";
import { PaneTab } from "./PaneTab";
import { paneMenu, usePaneHints } from "./paneMenu";
import { NUMBERED_TABS, tabNumbers } from "./tabNumber";

// One pane's tab row: the same `.detail-tabs` the detail has always had, plus what
// arranging needs — tabs drag (to reorder, to another pane, or to a pane's edge to
// split), right-click for the pane menu, and a ⋯ at the end for the same menu
// without a mouse. The shown tab's own controls (the agent's view switch) sit at the end.
// The pane's × and ⋯ show on the focused pane, and on another while the strip is
// hovered or holds focus (IntelliJ's New UI); right-click on a tab is the other path.
// Tabs name their ⌘1–9 in their tooltips. A narrow pane's tabs are measured to fit
// (`useTabFit`): icons named by their tooltips, then a "more" menu.
export function PaneTabStrip({ group, focused }: { group: PaneGroup; focused: boolean }) {
  const { panes, narrow, multi, focusLater } = usePaneArea();
  const hints = usePaneHints();
  const { menu, openAt, close: closeMenu } = useContextMenuAt<string>();
  const [insertAt, setInsertAt] = useState<{ index: number; x: number } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const fit = useTabFit(fitRef, moreRef, group.active);
  const dragging = useTabDrag((s) => s.drag);
  const active = panes.panels.get(group.active);
  const refocus = focusLater;

  // ⌘1–9 pick the detail's tabs wherever they sit: each tab names its number.
  const numbers = tabNumbers(panes.panels.values());
  const numberHints = useNumberedHints("detailTab", NUMBERED_TABS);
  const numberKeys = useNumberedAriaKeys("detailTab", NUMBERED_TABS);

  // The tabs on show (not those in the "more" menu), and where each sits in the group.
  const shownTabs = () => [
    ...(stripRef.current?.querySelectorAll<HTMLElement>("[data-tab]:not(.fit-out)") ?? []),
  ];
  const tabRects = () => shownTabs().map((el) => el.getBoundingClientRect());
  /** The tab a drop at `index` (counted among the tabs on screen) lands before; none: the end. */
  const tabBefore = (index: number) => shownTabs()[index]?.dataset.tab;

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
    const before = tabBefore(insertionIndex(tabRects(), e.clientX));
    panes.apply((l) => moveTab(l, drag.tab, group.id, before));
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
      className={`detail-tabs pn-strip${focused && multi && !narrow ? " focused" : ""}${focused || !multi || narrow ? " pn-chrome-on" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="tab-fit" ref={fitRef}>
        {group.tabs.map((tab, i) => {
          const panel = panes.panels.get(tab);
          if (!panel) return null;
          const mode = fit.mode(tab);
          const number = numbers.get(tab);
          return (
            <Fragment key={tab}>
              {i > 0 && panel.section !== panes.panels.get(group.tabs[i - 1])?.section && (
                <span className={`detail-tab-sep${fitClass(mode)}`} data-fit-of={tab} />
              )}
              <PaneTab
                panel={panel}
                mode={mode}
                active={tab === group.active}
                dragged={dragging?.tab === tab && dragging.scope === panes.scope}
                draggable={!narrow}
                hint={number ? numberHints[number - 1] : ""}
                ariaKeys={number ? numberKeys[number - 1] : undefined}
                onSelect={() => panes.select(tab)}
                onClose={() =>
                  panel.onClose ? panel.onClose() : panes.apply((l) => removeTab(l, tab))
                }
                onContextMenu={openAt(tab)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", panel.label);
                  beginTabDrag({ scope: panes.scope, tab });
                }}
                onDragEnd={() => {
                  setInsertAt(null);
                  endTabDrag();
                }}
              />
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
              <TabMore
                count={fit.out.length}
                open={open}
                toggle={toggle}
                className={`detail-tab pn-more${open ? " active" : ""}`}
              />
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
          <IconButton
            size="sm"
            className="ghost pn-act"
            label="Close pane"
            title="Close pane: its tabs join the pane beside it"
            onClick={() => panes.apply((l) => closeGroup(l, group.id))}
          >
            <I.X size={14} />
          </IconButton>
        )}
        <PopMenu
          trigger={({ open, toggle }) => (
            <MoreTrigger
              size="sm"
              className={`ghost pn-act${open ? " open" : ""}`}
              label="Pane actions"
              open={open}
              toggle={toggle}
            />
          )}
          sections={paneMenu(panes, group.active, hints, narrow, refocus)}
        />
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sections={paneMenu(panes, menu.target, hints, narrow, refocus)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
