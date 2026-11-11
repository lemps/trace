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
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (e: MouseEvent<HTMLElement>) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}

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
  onSelect,
  onClose,
  onContextMenu,
  onDragStart,
  onDragEnd,
}: PaneTabProps) {
  const Icon = panel.icon;
  const out = mode === "out";
  return (
    <>
      <button
        type="button"
        data-tab={panel.id}
        data-fit-tab={panel.id}
        className={`detail-tab${active ? " active" : ""}${dragged ? " dragged" : ""}${fitClass(mode)}`}
        title={titleWithHint(panel.title ?? panel.label, hint)}
        aria-label={panel.label}
        aria-keyshortcuts={ariaKeys}
        aria-hidden={out || undefined}
        tabIndex={out ? -1 : undefined}
        draggable={draggable && !out}
        onClick={onSelect}
        onContextMenu={onContextMenu}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <Icon size={12} />
        <span className="pn-tab-label" data-fit-label>
          {panel.label}
        </span>
        {panel.badge}
      </button>
      {(panel.optional || panel.onClose) && (
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
