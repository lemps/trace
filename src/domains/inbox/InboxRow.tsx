import type { DragEvent } from "react";
import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";
import type { LiveEntry } from "@/domains/live/entries";
import { ageLabel, shownAsk } from "@/domains/live/light";
import { useHint, useTitleWithHint } from "@/platform/shortcuts";
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
// double-click) opens it; the cross (or E) takes it out of "Needs you".
export function InboxRow(props: InboxRowProps) {
  const { entry, selected, now, dropAbove, isDragging, dragProps, onSelect, onOpen } = props;
  const { info } = entry;
  const ask = shownAsk(info);
  const dismissTitle = `${useTitleWithHint("Dismiss", "inboxDismiss")}: takes it out of Needs you. This doesn't answer the agent.`;
  const openTitle = useTitleWithHint("Open", "inboxOpen");
  const reorder = `${useHint("inboxMoveUp")} / ${useHint("inboxMoveDown")}`;
  return (
    <>
      {dropAbove && <div className="ib-drop" aria-hidden="true" />}
      {/* A div, not a <button>: draggable buttons are unreliable across engines
          (the session list's rows do the same). Keys are the inbox's (useInboxKeys). */}
      {/* biome-ignore lint/a11y/useSemanticElements: draggable row; see above */}
      <div
        role="button"
        tabIndex={0}
        className={`ib-row${selected ? " sel" : ""}${isDragging ? " dragging" : ""}`}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        onDoubleClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === " ") onSelect();
        }}
        {...dragProps}
      >
        <span className="ib-grip" title={titleWithHint("Drag to reorder", reorder)}>
          <I.Grip size={14} />
        </span>
        <StatusLight light={info.light} />
        <span className="ib-main">
          <span className="ib-top">
            <span className="ib-sub">{entry.subtitle}</span>
            {ask && <StatusLight light="attention" variant="pill" label={ask.label} />}
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
          <span className="ib-row-actions">
            {info.light === "attention" && (
              <button
                type="button"
                className="ib-open"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDismiss();
                }}
                title={dismissTitle}
                aria-label={`Dismiss ${entry.title}`}
              >
                <I.X size={13} />
              </button>
            )}
            <button
              type="button"
              className="ib-open"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              title={openTitle}
              aria-label={`Open ${entry.title}`}
            >
              <I.Chevron size={13} />
            </button>
          </span>
        </span>
      </div>
    </>
  );
}
