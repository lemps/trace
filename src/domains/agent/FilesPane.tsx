import { type ReactNode, useEffect, useState } from "react";
import { AutoSidebar } from "@/components/AutoSidebar";
import { I } from "@/components/Icon";
import { useQuickOpenStore } from "@/domains/quickOpen/store";
import { currentOs } from "@/platform/os";
import { basename, worktreeRelative } from "@/platform/paths";
import { FileView, LoadingDiff } from "./FileView";
import { FilesSidebar } from "./files/FilesSidebar";
import { toTreePath } from "./files/filePaths";
import { SidebarDivider } from "./files/SidebarDivider";
import { useFilesView, useSidebarWidth } from "./files/store";
import { useFileDiff } from "./files/useFileDiff";
import { type FilesData, useFilesData } from "./files/useFilesData";
import { type TreeState, useTreeState } from "./files/useTreeState";

// "Files" tab — a workspace's files beside a viewer. The sidebar shows the changes
// against origin/<default-branch> (a tree, or a flat list) or every file in the
// worktree, filterable; the viewer shows the picked file's diff, or its source when
// unchanged. Self-contained: everything it remembers is keyed by `workspaceId`.
export function FilesPane({ workspaceId }: { workspaceId: string }) {
  // A fresh body per workspace, so nothing loaded for one shows in another.
  return <FilesBody key={workspaceId} workspaceId={workspaceId} />;
}

function FilesBody({ workspaceId }: { workspaceId: string }) {
  const [view, patch] = useFilesView(workspaceId);
  // Bumped to show the folded list for a moment: a file revealed in the tree.
  const [peek, setPeek] = useState(0);
  const width = useSidebarWidth((s) => s.width);
  const data = useFilesData(workspaceId, view.mode, view.selected);
  const { summary } = data;
  const t = useTreeState(data.mode, summary, data.all, view, patch);
  const selected = view.selected;
  const change = selected ? t.changes.get(selected) : undefined;
  const file = useFileDiff(workspaceId, selected, change?.oldPath, data.version);

  // Nothing open yet: start on the first change.
  useEffect(() => {
    if (view.selected === null && t.firstChange) patch({ selected: t.firstChange });
  }, [view.selected, t.firstChange, patch]);

  // A Quick Open pick: open it and show it in the tree. Taking it out of the store
  // means it happens once, not every time the tab mounts.
  const pick = useQuickOpenStore((s) => s.reveals[workspaceId]);
  const clearPick = useQuickOpenStore((s) => s.clearReveal);
  const { reveal } = t;
  const summaryKnown = summary !== null || data.summaryError !== null;
  useEffect(() => {
    // Wait for the changes: they decide whether the pick shows under Changes or All files.
    if (!pick || !summaryKnown) return;
    const path = toTreePath(worktreeRelative(pick.path, currentOs));
    patch({ selected: path });
    setPeek((n) => n + 1);
    reveal(path, false);
    clearPick(workspaceId);
  }, [pick, summaryKnown, workspaceId, clearPick, patch, reveal]);

  const showInTree = (path: string, isDir: boolean) => {
    setPeek((n) => n + 1);
    reveal(path, isDir);
  };

  const count = summary ? summary.files.length : null;
  const sidebar = (
    <AutoSidebar
      id="files"
      label={t.mode === "changes" ? "Changes" : "All files"}
      icon={I.Folder}
      count={count}
      width={width}
      head={false}
      peek={peek}
      after={<SidebarDivider />}
    >
      {(pin) => (
        <FilesSidebar
          workspaceId={workspaceId}
          mode={t.mode}
          onMode={(mode) => patch({ mode })}
          changeCount={count}
          flat={view.flat}
          onFlat={(flat) => patch({ flat })}
          filter={view.filter}
          onFilter={(filter) => patch({ filter })}
          notice={sidebarNotice(t, data, view.filter)}
          footnote={footnote(t, data)}
          rows={t.rows}
          isOpen={t.isOpen}
          selected={selected}
          query={t.query}
          focus={t.focus}
          onFocusDone={t.clearFocus}
          onToggle={t.toggle}
          onOpen={(f) => patch({ selected: f.path })}
          onRefresh={data.refresh}
          pin={pin}
        />
      )}
    </AutoSidebar>
  );

  let viewer: ReactNode;
  if (!selected) {
    viewer =
      summary && summary.files.length === 0 ? (
        <Centered title="No changes" hint={`The worktree matches ${summary.base}.`} />
      ) : (
        <Centered title="No file open" hint="Pick a file in the list to see it here." />
      );
  } else if (!t.exists(selected)) {
    viewer = (
      <Centered title={`${basename(selected)} isn't in the worktree any more`} hint={selected} />
    );
  } else if (file.diff?.path === selected) {
    viewer = (
      // Keyed by path: switching files remounts it, so its Diff / Preview resets.
      <FileView
        key={selected}
        fd={file.diff}
        workspaceId={workspaceId}
        change={change}
        onReveal={showInTree}
      />
    );
  } else if (file.error) {
    viewer = <div className="diff-note">{file.error}</div>;
  } else {
    viewer = <LoadingDiff />;
  }

  return (
    <div className="tab-pane no-pad">
      <div className="fx-pane">
        {sidebar}
        <div className="diff-pane fx-viewer">{viewer}</div>
      </div>
    </div>
  );
}

/** What the sidebar says instead of a tree: loading, an error, or nothing to list. */
function sidebarNotice(t: TreeState, data: FilesData, filter: string): ReactNode {
  const box = (text: string) => <div className="ib-empty">{text}</div>;
  if (t.mode === "changes") {
    if (data.summaryError && !data.summary) {
      return box(`Couldn't work out the changes: ${data.summaryError}`);
    }
    if (!data.summary) return box("Comparing with the base branch…");
    if (data.summary.files.length === 0) {
      return box(`No changes yet: the worktree matches ${data.summary.base}.`);
    }
  } else {
    if (data.allError && !data.all) return box(`Couldn't list the files: ${data.allError}`);
    if (!data.all) return box("Listing files…");
    if (data.all.files.length === 0) return box("This worktree has no files yet.");
  }
  if (t.filtered && t.filtered.root.children.length === 0) {
    return box(`Nothing matches “${filter.trim()}”.`);
  }
  return null;
}

function footnote(t: TreeState, data: FilesData): string | null {
  if (t.filtered) {
    const n = t.filtered.hits;
    return `${n.toLocaleString()} match${n === 1 ? "" : "es"}`;
  }
  if (t.mode === "all" && data.all?.truncated) {
    return `Showing the first ${data.all.files.length.toLocaleString()} files.`;
  }
  return null;
}

function Centered({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <div className="inner">
        <div className="title">{title}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
    </div>
  );
}
