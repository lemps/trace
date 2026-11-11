import type { DragEvent } from "react";
import { I } from "@/components/Icon";
import { RowBar, RowMenuPopover } from "@/components/RowMenu";
import { StatusLight } from "@/components/StatusLight";
import { barActions, type RowAction, useRowMenu } from "@/components/useRowMenu";
import { useAgentRowActions } from "@/domains/fleet/agentRowActions";
import type { LiveEntry } from "@/domains/live/entries";
import { ageLabel, shownAsk } from "@/domains/live/light";
import { useHint } from "@/platform/shortcuts";
import { titleWithHint } from "@/platform/shortcuts/hintText";

interface InboxRowProps {
  entry: LiveEntry;
  selected: boolean;
  now: number;
  /** Drop line above this row (a drag is hovering its upper half). */
  dropAbove: boolean;
  isDragging: boolean;
  dragProps: {
    draggable: boolean;
    onDragStart: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
    onDragEnd: () => void;
  };
  onSelect: () => void;
  onOpen: () => void;
  onDismiss: () => void;
}

// One agent in the inbox list: its light and ask, title, last words, and how
// long it's been like this. A drag handle reorders; the arrow (or ⏎, or a
// double-click) opens it; the cross (or E) takes it out of "Needs you". Those two
// and the rest (`useAgentRowActions`) are behind its ⋯ and its right-click too.
export function InboxRow(props: InboxRowProps) {
  const { entry, selected, now, dropAbove, isDragging, dragProps, onSelect, onOpen } = props;
  const { info } = entry;
  const ask = shownAsk(info);
  const reorder = `${useHint("inboxMoveUp")} / ${useHint("inboxMoveDown")}`;
  const lead: RowAction[] = [];
  const dismissHint = useHint("inboxDismiss");
  const openHint = useHint("inboxOpen");
  if (info.light === "attention") {
    lead.push({
      id: "dismiss",
      label: "Dismiss",
      glyph: I.X,
      inBar: true,
      shortcut: "inboxDismiss",
      hint: dismissHint,
      title: "Takes it out of Needs you. This doesn't answer the agent.",
      onSelect: props.onDismiss,
    });
  }
  lead.push({
    id: "open",
    label: "Open",
    glyph: I.Chevron,
    inBar: true,
    shortcut: "inboxOpen",
    hint: openHint,
    onSelect: onOpen,
  });
  const actions = useAgentRowActions({ entry, onOpen, lead });
  const menu = useRowMenu();
  return (
    <>
      {dropAbove && <div className="ib-drop" aria-hidden="true" />}
      {/* A div, not a <button>: draggable buttons are unreliable across engines
          (the session list's rows do the same). Keys are the inbox's (useInboxKeys). */}
      {/* biome-ignore lint/a11y/useSemanticElements: draggable row; see above */}
      <div
        role="button"
        tabIndex={0}
        className={`ib-row${selected ? " sel" : ""}${isDragging ? " dragging" : ""}${menu.at ? " menu-open" : ""}`}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        onDoubleClick={onOpen}
        onKeyDown={(e) => {
          // Space on one of its buttons is that button's.
          if (e.target === e.currentTarget && e.key === " ") onSelect();
        }}
        onContextMenu={menu.onContextMenu}
        {...dragProps}
      >
        <span className="ib-grip" title={titleWithHint("Drag to reorder", reorder)}>
          <I.Grip size={14} />
        </span>
        <StatusLight light={info.light} />
        <span className="ib-main">
          <span className="ib-top">
            <span className="ib-sub">{entry.subtitle}</span>
            {/* The light is the first column's; here, only what it asks. */}
            {ask && <StatusLight light="attention" variant="word" label={ask.label} dotless />}
          </span>
          <span className="ib-title">{entry.title}</span>
          {/* What it's asking (a command, a question) beats what it last said. */}
          {(ask?.detail ?? info.lastMessage) && (
            <span className="ib-snip">{ask?.detail ?? info.lastMessage}</span>
          )}
        </span>
        <span className="ib-side">
          <span className={`ib-age${info.light === "attention" ? " hot" : ""}`}>
            {ageLabel(info.since, now)}
          </span>
          <RowBar
            className="ib-row-actions"
            actions={barActions(actions)}
            menu={menu}
            moreLabel="Agent actions"
          />
        </span>
      </div>
      <RowMenuPopover menu={menu} sections={actions} />
    </>
  );
}
