import { type KeyboardEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Segmented } from "@/components/Segmented";
import { EDITORS } from "@/domains/agent/editorItems";
import { type Editor, openInEditor } from "@/ipc/editor";
import { listWorkspaceFiles, type WorktreeFiles } from "@/ipc/files";
import { preferredEditor, setPreferredEditor } from "./editorPref";
import { type FuzzyMatch, rankFiles } from "./fuzzy";
import { Highlighted } from "./Highlighted";

const LIMIT = 50;

interface QuickOpenProps {
  workspaceId: string;
  onClose: () => void;
  /** Show the picked file in the Files tab's viewer. */
  onView: (path: string) => void;
}

// Fuzzy-find a file in the open worktree: Enter views it in the Files tab, Shift+Enter
// opens it in the user's editor. The list is git's (tracked + new, minus ignored),
// fetched each time the picker opens so it's never stale.
export function QuickOpen({ workspaceId, onClose, onView }: QuickOpenProps) {
  const [list, setList] = useState<WorktreeFiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [editor, setEditor] = useState<Editor>(preferredEditor);
  const listRef = useRef<HTMLDivElement>(null);
  // Ranking a big repo takes a few dozen ms: let typing stay ahead of it.
  const deferred = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;
    listWorkspaceFiles(workspaceId)
      .then((l) => {
        if (!cancelled) setList(l);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const hits = useMemo(
    () => (list ? rankFiles(deferred, list.files, LIMIT) : []),
    [list, deferred]
  );
  const current = hits[Math.min(active, hits.length - 1)];

  // Keep the highlighted row in view as the arrows move it (or new results replace it).
  // biome-ignore lint/correctness/useExhaustiveDependencies: active and hits are the triggers
  useEffect(() => {
    listRef.current?.querySelector(".qo-row.active")?.scrollIntoView({ block: "nearest" });
  }, [active, hits]);

  const view = (hit: FuzzyMatch) => {
    onView(hit.path);
    onClose();
  };
  const edit = (hit: FuzzyMatch) => {
    void openInEditor(workspaceId, editor, hit.path).catch((e) => toast.error(String(e)));
    onClose();
  };
  const chooseEditor = (next: Editor) => {
    setEditor(next);
    setPreferredEditor(next);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && current) {
      e.preventDefault();
      if (e.shiftKey) edit(current);
      else view(current);
    }
  };

  const editorLabel = EDITORS.find((ed) => ed.id === editor)?.label ?? "your editor";
  return (
    <Modal
      title="Quick Open"
      onClose={onClose}
      className="qo-modal"
      footer={
        <div className="qo-foot">
          <span className="qo-hints">
            <span className="kbd">↵</span> view in Files
            <span className="kbd">⇧↵</span> open in {editorLabel}
          </span>
          <Segmented
            label="Editor"
            value={editor}
            options={EDITORS.map((ed) => ({ value: ed.id, label: ed.label }))}
            onChange={chooseEditor}
          />
        </div>
      }
    >
      <div className="qo-input">
        <I.Search size={13} />
        <input
          // biome-ignore lint/a11y/noAutofocus: the picker exists to be typed into
          autoFocus
          placeholder="Search files by name or path…"
          aria-label="Search files"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        {list && <span className="qo-count">{list.files.length.toLocaleString()} files</span>}
      </div>
      <div className="qo-list" ref={listRef}>
        {error ? (
          <div className="qo-empty">Couldn't list this worktree's files: {error}</div>
        ) : !list ? (
          <div className="qo-empty">Listing files…</div>
        ) : hits.length === 0 ? (
          <div className="qo-empty">
            {list.files.length === 0 ? "This worktree has no files yet." : "No file matches that."}
          </div>
        ) : (
          hits.map((hit, i) => (
            <button
              type="button"
              key={hit.path}
              className={`qo-row${hit === current ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => (e.shiftKey ? edit(hit) : view(hit))}
              title={hit.path}
            >
              <I.File size={13} />
              <Highlighted path={hit.path} positions={hit.positions} />
            </button>
          ))
        )}
        {list?.truncated && (
          <div className="qo-note">
            Showing the first {list.files.length.toLocaleString()} files.
          </div>
        )}
      </div>
    </Modal>
  );
}
