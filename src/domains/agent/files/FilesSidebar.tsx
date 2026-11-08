import type { ReactNode } from "react";
import type { SidebarPin } from "@/components/AutoSidebar";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { Segmented } from "@/components/Segmented";
import { useQuickOpenStore } from "@/domains/quickOpen/store";
import { FileTree, type TreeFocus } from "./FileTree";
import type { Query, Row } from "./rows";
import type { FilesMode } from "./store";
import type { DirNode, FileNode } from "./tree";

interface FilesSidebarProps {
  workspaceId: string;
  mode: FilesMode;
  onMode: (mode: FilesMode) => void;
  /** How many files changed; null until the summary loads. */
  changeCount: number | null;
  flat: boolean;
  onFlat: (flat: boolean) => void;
  filter: string;
  onFilter: (text: string) => void;
  /** What the tree area says instead of rows (loading, an error, nothing here). */
  notice: ReactNode;
  /** A footnote under the tree (the list was cut short). */
  footnote: string | null;
  rows: readonly Row[];
  isOpen: (dir: DirNode) => boolean;
  selected: string | null;
  query: Query | null;
  focus: TreeFocus | null;
  onFocusDone: () => void;
  onToggle: (dirs: DirNode[], open: boolean) => void;
  onOpen: (file: FileNode) => void;
  onRefresh: () => void;
  /** Keep the list open beside the viewer, or let it fold away (AutoSidebar). */
  pin: SidebarPin;
}

function ModeLabel({ text, count }: { text: string; count?: number | null }) {
  return (
    <>
      {text}
      {count != null && count > 0 && <span className="fx-seg-count">{count}</span>}
    </>
  );
}

// The Files tab's left side: Changes / All files, a filter, and the tree. It folds
// away while not pointed at (AutoSidebar), so the viewer has the width; its own
// header's pin keeps it open beside the viewer instead.
export function FilesSidebar(p: FilesSidebarProps) {
  const showQuickOpen = useQuickOpenStore((s) => s.show);
  const isChanges = p.mode === "changes";
  return (
    <div className="fx-side">
      <div className="fx-head">
        <Segmented
          label="Show"
          className="fx-mode"
          value={p.mode}
          options={[
            { value: "changes", label: <ModeLabel text="Changes" count={p.changeCount} /> },
            { value: "all", label: <ModeLabel text="All files" /> },
          ]}
          onChange={p.onMode}
        />
        <span className="fx-spacer" />
        <IconButton
          size="sm"
          className="ghost"
          label={p.pin.pinned ? "Let the file list hide" : "Keep the file list open"}
          aria-pressed={p.pin.pinned}
          onClick={p.pin.toggle}
        >
          <I.Pin size={14} />
        </IconButton>
      </div>
      <div className="fx-tools">
        <label className="fx-filter">
          <I.Filter size={14} />
          <input
            value={p.filter}
            placeholder={isChanges ? "Filter changes" : "Filter files"}
            aria-label="Filter the file list"
            spellCheck={false}
            onChange={(e) => p.onFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && p.filter) {
                e.preventDefault();
                e.stopPropagation();
                p.onFilter("");
              } else if (e.key === "ArrowDown") {
                // Down from the filter goes to the tree, to pick a match.
                e.preventDefault();
                e.currentTarget
                  .closest(".fx-side")
                  ?.querySelector<HTMLElement>(".fx-tree")
                  ?.focus();
              }
            }}
          />
          {p.filter && (
            <IconButton
              size="xs"
              className="ghost"
              onClick={() => p.onFilter("")}
              label="Clear the filter"
            >
              <I.X size={12} />
            </IconButton>
          )}
        </label>
        {isChanges && (
          <IconButton
            size="sm"
            className="ghost"
            label="Show changes as a list"
            aria-pressed={p.flat}
            onClick={() => p.onFlat(!p.flat)}
          >
            <I.List size={14} />
          </IconButton>
        )}
        <IconButton size="sm" className="ghost" label="Refresh" onClick={p.onRefresh}>
          <I.Refresh size={14} />
        </IconButton>
        <IconButton
          size="sm"
          className="ghost"
          label="Quick Open"
          shortcut="quickOpen"
          onClick={() => showQuickOpen(p.workspaceId)}
        >
          <I.Search size={14} />
        </IconButton>
      </div>
      {p.notice ? (
        <div className="fx-notice">{p.notice}</div>
      ) : (
        <FileTree
          rows={p.rows}
          isOpen={p.isOpen}
          selected={p.selected}
          query={p.query}
          flat={isChanges && p.flat}
          showStats={isChanges}
          focus={p.focus}
          onFocusDone={p.onFocusDone}
          label={isChanges ? "Changed files" : "All files"}
          onToggle={p.onToggle}
          onOpen={p.onOpen}
        />
      )}
      {p.footnote && <div className="fx-foot">{p.footnote}</div>}
    </div>
  );
}
