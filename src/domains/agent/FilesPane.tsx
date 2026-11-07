import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { I } from "@/components/Icon";
import { useQuickOpenStore } from "@/domains/quickOpen/store";
import { type DiffSummary, type FileDiff, gitDiffFile, gitDiffSummary } from "@/ipc/diff";
import { useHint } from "@/platform/shortcuts";
import { FileView, LoadingDiff } from "./FileView";

// "Files" tab — git diff for a workspace (a board agent's worktree, or an
// exploratory session's repo root) vs origin/<default-branch>. Summary loads
// once; per-file hunks load on selection. A file picked in Quick Open shows here
// too, under "Opened", even when it has no changes.
export function FilesPane({ workspaceId }: { workspaceId: string }) {
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const reveal = useQuickOpenStore((s) => s.reveals[workspaceId]);
  const clearReveal = useQuickOpenStore((s) => s.clearReveal);
  // The Quick Open pick, kept while the tab is open; a summary reload must not deselect it.
  const [opened, setOpened] = useState<string | null>(null);
  const openedRef = useRef(opened);
  openedRef.current = opened;

  // Fetch (or re-fetch) the summary. Keeps the open file selected when it
  // still exists; returns a cancel fn so the mount effect can abort on unmount.
  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    gitDiffSummary(workspaceId)
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
        setSelected((prev) =>
          prev && (prev === openedRef.current || s.files.some((f) => f.path === prev))
            ? prev
            : (openedRef.current ?? s.files[0]?.path ?? null)
        );
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    // Fresh workspace — reset before the first fetch.
    setSummary(null);
    setSelected(null);
    setFileDiff(null);
    return load();
  }, [load]);

  // Each Quick Open pick (even of the same file again) selects it. Taking it out of
  // the store means it lasts while this tab is open, not every time it opens.
  useEffect(() => {
    if (!reveal) return;
    setOpened(reveal.path);
    setSelected(reveal.path);
    clearReveal(workspaceId);
  }, [reveal, workspaceId, clearReveal]);

  // Re-read on `summary` too: a refresh may have changed the open file's diff.
  // biome-ignore lint/correctness/useExhaustiveDependencies: summary is a refresh trigger
  useEffect(() => {
    if (!selected) {
      setFileDiff(null);
      return;
    }
    let cancelled = false;
    setLoadingFile(true);
    setFileError(null);
    gitDiffFile(workspaceId, selected)
      .then((d) => {
        if (!cancelled) {
          setFileDiff(d);
          setLoadingFile(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          // One file failing leaves the rest of the tab usable.
          setFileDiff(null);
          setFileError(String(e));
          setLoadingFile(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, selected, summary]);

  if (error) return <Centered title="Couldn't load diff" hint={error} />;
  if (!summary)
    return <Centered title="Loading…" hint="Computing changes against the base branch." />;
  const isChanged = (path: string) => summary.files.some((f) => f.path === path);
  const extra = opened && !isChanged(opened) ? opened : null;
  if (summary.files.length === 0 && !extra)
    return <Centered title="No changes" hint={`Worktree matches ${summary.base}.`} />;

  return (
    <div className="tab-pane no-pad">
      <div className="files-pane">
        <FileTree
          workspaceId={workspaceId}
          files={summary.files}
          opened={extra}
          selected={selected}
          onSelect={setSelected}
          onRefresh={() => void load()}
        />
        <div className="diff-pane">
          {fileError ? (
            <div className="diff-note">{fileError}</div>
          ) : fileDiff ? (
            // Key by path so switching files remounts FileView — its preview
            // toggle resets to the diff without a reset effect.
            <FileView
              key={fileDiff.path}
              fd={fileDiff}
              workspaceId={workspaceId}
              isChanged={isChanged(fileDiff.path)}
            />
          ) : loadingFile ? (
            <LoadingDiff />
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface FileTreeProps {
  workspaceId: string;
  files: { path: string; add: number; del: number }[];
  /** A file Quick Open picked that isn't among the changes. */
  opened: string | null;
  selected: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => void;
}

function FileTree({ workspaceId, files, opened, selected, onSelect, onRefresh }: FileTreeProps) {
  const quickOpenHint = useHint("quickOpen");
  const showQuickOpen = useQuickOpenStore((s) => s.show);
  return (
    <div className="file-tree">
      <div className="group">
        Changed ({files.length})
        <span className="tree-actions">
          <button
            type="button"
            className="tree-refresh"
            onClick={() => showQuickOpen(workspaceId)}
            title={`Quick Open a file (${quickOpenHint})`}
            aria-label="Quick Open a file"
          >
            <I.Search size={12} />
          </button>
          <button
            type="button"
            className="tree-refresh"
            onClick={onRefresh}
            title="Refresh changes"
            aria-label="Refresh changes"
          >
            <I.Activity size={12} />
          </button>
        </span>
      </div>
      {files.map((f) => (
        <FileNode
          key={f.path}
          path={f.path}
          stat={f}
          active={selected === f.path}
          onSelect={() => onSelect(f.path)}
        />
      ))}
      {opened && (
        <>
          <div className="group">Opened</div>
          <FileNode path={opened} active={selected === opened} onSelect={() => onSelect(opened)} />
        </>
      )}
    </div>
  );
}

interface FileNodeProps {
  path: string;
  /** Lines added and removed; none for an unchanged file. */
  stat?: { add: number; del: number };
  active: boolean;
  onSelect: () => void;
}

function FileNode({ path, stat, active, onSelect }: FileNodeProps) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") onSelect();
  };
  const name = path.split("/").pop() ?? path;
  return (
    // biome-ignore lint/a11y/useSemanticElements: in a scroll list of many nodes; div+role keeps the file-tree CSS layout intact, keyboard activation provided
    <div
      className={`node${active ? " active" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKey}
      title={path}
    >
      <I.File size={12} />
      <span className="node-name">{name}</span>
      {stat && (
        <span className="stat">
          <span className="add">+{stat.add}</span>
          <span className="del">−{stat.del}</span>
        </span>
      )}
    </div>
  );
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
