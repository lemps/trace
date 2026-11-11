import { type DragEvent, type ReactNode, useState } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { InlineConfirm } from "@/components/InlineConfirm";
import { sessionsDrag } from "./dragState";
import { TitleEditor } from "./TitleEditor";
import type { SessionSection } from "./types";

interface SectionGroupProps {
  section: SessionSection;
  count: number;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  /** A session card was dropped on this section. */
  onDropSession: (sessionId: string) => void;
  /** Another section's header was dropped on this one (reorder before it). */
  onDropSection: (sectionId: string) => void;
  /** This section's sort menu, at the end of its header. */
  sortMenu: ReactNode;
  children: ReactNode;
}

// One collapsible vertical group of sessions within a tab. The header drags
// to reorder sections; the whole group accepts session-row drops.
export function SectionGroup({
  section,
  count,
  onToggle,
  onRename,
  onDelete,
  onDropSession,
  onDropSection,
  sortMenu,
  children,
}: SectionGroupProps) {
  const [over, setOver] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const onDragOver = (e: DragEvent) => {
    const drag = sessionsDrag.current;
    if (!drag) return;
    if (drag.kind === "session" || (drag.kind === "section" && drag.id !== section.id)) {
      e.preventDefault();
      setOver(true);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const drag = sessionsDrag.current;
    sessionsDrag.current = null;
    if (!drag) return;
    if (drag.kind === "session") onDropSession(drag.id);
    else if (drag.kind === "section" && drag.id !== section.id) onDropSection(drag.id);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop zone wrapper; the interactive controls are the buttons inside
    <section
      className={`sec-group${over ? " drop-target" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle row; its controls are real buttons */}
      <div
        className="sec-head"
        draggable={!renaming}
        onDragStart={(e) => {
          sessionsDrag.current = { kind: "section", id: section.id };
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", section.id);
        }}
        onDragEnd={() => {
          sessionsDrag.current = null;
        }}
      >
        <IconButton
          size="xs"
          className="ghost"
          onClick={onToggle}
          aria-expanded={!section.collapsed}
          label={section.collapsed ? "Expand section" : "Collapse section"}
        >
          <I.Chevron size={12} />
        </IconButton>
        {renaming ? (
          <TitleEditor
            initial={section.name}
            onSave={onRename}
            onClose={() => setRenaming(false)}
          />
        ) : (
          <span className="sec-name">{section.name}</span>
        )}
        <span className="count">{count}</span>
        <span className="sec-actions">
          <IconButton
            size="xs"
            className="ghost"
            onClick={() => setRenaming(true)}
            label="Rename section"
          >
            <I.Pencil size={12} />
          </IconButton>
          <InlineConfirm
            label={<I.Trash size={12} />}
            className="btn ghost icon xs"
            size="xs"
            ariaLabel="Delete section"
            message={`Delete ${section.name}? Its sessions stay in this tab.`}
            confirmLabel="Delete"
            onConfirm={onDelete}
          />
        </span>
        <span className="sec-sort">{sortMenu}</span>
      </div>
      {!section.collapsed && children}
    </section>
  );
}
