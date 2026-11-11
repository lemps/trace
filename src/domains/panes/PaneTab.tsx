import type { DragEvent, MouseEvent } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { fitClass, type TabFitMode } from "@/components/useTabFit";
import { titleWithHint } from "@/platform/shortcuts/hintText";
import type { PanelDescriptor } from "./types";

interface PaneTabProps {
  panel: PanelDescriptor;
  mode: TabFitMode;
  active: boolean;
  dragged: boolean;
  draggable: boolean;
  /** The shortcut that picks it ("⌘3"), named in its tooltip; "" for none. */
  hint: string;
  ariaKeys?: string;
  /**
   * For a tab an agent owns, in a detail hosting several agents: that agent's name,
   * before the label, so it's clear whose subagent it is.
   */
  owner?: string;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (e: MouseEvent<HTMLElement>) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}

/** Whether a panel's tab has a × (and closes on middle-click). */
const isClosable = (p: PanelDescriptor) => p.closable ?? Boolean(p.optional || p.onClose);

/**
 * One tab of a pane's strip, and its × when it has one: a coming tab's hides it,
 * an optional one's closes it. The × keeps its slot, clear until the tab is hovered
 * or focused, so labels never shift (trace-ui §5, the reveal recipe).
 */
export function PaneTab({
  panel,
  mode,
  active,
  dragged,
  draggable,
  hint,
  ariaKeys,
  owner,
  onSelect,
  onClose,
  onContextMenu,
  onDragStart,
  onDragEnd,
}: PaneTabProps) {
  const Icon = panel.icon;
  const out = mode === "out";
  const closable = isClosable(panel);
  const title = panel.title ?? panel.label;
  return (
    <>
      <button
        type="button"
        data-tab={panel.id}
        data-fit-tab={panel.id}
        // A subagent's tab gives up its label before the detail's own tabs do.
        data-fit-early={panel.optional ? "" : undefined}
        className={`detail-tab${active ? " active" : ""}${dragged ? " dragged" : ""}${fitClass(mode)}`}
        title={titleWithHint(owner ? `${owner} · ${title}` : title, hint)}
        aria-label={owner ? `${owner}: ${panel.label}` : panel.label}
        aria-keyshortcuts={ariaKeys}
        aria-hidden={out || undefined}
        tabIndex={out ? -1 : undefined}
        draggable={draggable && !out}
        onClick={onSelect}
        onAuxClick={(e) => {
          if (e.button !== 1 || !closable) return;
          e.preventDefault();
          onClose();
        }}
        onContextMenu={onContextMenu}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <Icon size={12} />
        {owner && (
          <span className="pn-tab-owner" data-fit-label>
            {owner}
          </span>
        )}
        <span className={`pn-tab-label${panel.optional ? " capped" : ""}`} data-fit-label>
          {panel.label}
        </span>
        {panel.badge}
      </button>
      {closable && (
        <IconButton
          size="xs"
          className={`ghost pn-tab-close${fitClass(mode)}`}
          data-fit-of={panel.id}
          tabIndex={out ? -1 : undefined}
          aria-hidden={out || undefined}
          label={`${panel.comes ? "Hide" : "Close"} ${panel.label}`}
          onClick={onClose}
          onContextMenu={onContextMenu}
        >
          <I.X size={12} />
        </IconButton>
      )}
    </>
  );
}
