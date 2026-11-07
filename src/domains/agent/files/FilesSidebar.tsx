import type { ReactNode } from "react";
import { I } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { useQuickOpenStore } from "@/domains/quickOpen/store";
import { useAriaKeys, useTitleWithHint } from "@/platform/shortcuts";
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
  onHide: () => void;
}

function ModeLabel({ text, count }: { text: string; count?: number | null }) {
  return (
    <>
      {text}
      {count != null && count > 0 && <span className="fx-seg-count">{count}</span>}
    </>
  );
}

/** A square tool button in the sidebar's toolbar. */
function Tool(p: {
  label: string;
  /** The tooltip, when it says more than the label (its shortcut). */
  title?: string;
  keys?: string;
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`fx-tool${p.on ? " on" : ""}`}
      onClick={p.onClick}
      title={p.title ?? p.label}
      aria-label={p.label}
      aria-keyshortcuts={p.keys}
      aria-pressed={p.on}
    >
      {p.children}
    </button>
  );
}

// The Files tab's left side: Changes / All files, a filter, and the tree. Its own
// header hides it (the viewer then takes the width), as the right-hand side panel's does.
export function FilesSidebar(p: FilesSidebarProps) {
  const quickOpenTitle = useTitleWithHint("Quick Open", "quickOpen");
  const quickOpenKeys = useAriaKeys("quickOpen");
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
        <Tool label="Hide the file list" onClick={p.onHide}>
          <I.SidebarLeft size={14} />
        </Tool>
      </div>
      <div className="fx-tools">
        <label className="fx-filter">
          <I.Filter size={13} />
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
            <button
              type="button"
              className="fx-filter-clear"
              onClick={() => p.onFilter("")}
              aria-label="Clear the filter"
              title="Clear the filter"
            >
              <I.X size={12} />
            </button>
          )}
        </label>
        {isChanges && (
          <Tool label="Show changes as a list" on={p.flat} onClick={() => p.onFlat(!p.flat)}>
            <I.List size={14} />
          </Tool>
        )}
        <Tool label="Refresh" onClick={p.onRefresh}>
          <I.Refresh size={14} />
        </Tool>
        <Tool
          label="Quick Open"
          title={quickOpenTitle}
          keys={quickOpenKeys}
          onClick={() => showQuickOpen(p.workspaceId)}
        >
          <I.Search size={14} />
        </Tool>
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
