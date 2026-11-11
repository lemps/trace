import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { InlineConfirm } from "@/components/InlineConfirm";
import { listWorktrees, removeWorktree, type WorktreeInfo } from "@/ipc/worktrees";
import { basename } from "@/platform/paths";

// Worktree housekeeping: every .worktrees/ checkout across the configured
// repos, with merged/dirty/running status and removal confirmed inline. A dirty
// worktree's confirm warns that its uncommitted work is lost.
export function WorktreeSettings() {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const refresh = () => {
    setScanning(true);
    void listWorktrees()
      .then(setWorktrees)
      .finally(() => setScanning(false));
  };
  useEffect(refresh, []);

  const remove = async (wt: WorktreeInfo) => {
    setBusy(wt.path);
    try {
      await removeWorktree(wt.repo, wt.path, wt.branch, wt.dirty);
      refresh();
    } catch (err) {
      toast.error(`Couldn't remove ${wt.name}: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  // Clean, merged, idle worktrees — the no-questions-asked bulk target.
  const removable = worktrees.filter((wt) => wt.merged && !wt.dirty && !wt.running);
  const removeMerged = async () => {
    setBusy("*");
    try {
      for (const wt of removable) {
        await removeWorktree(wt.repo, wt.path, wt.branch, false);
      }
    } catch (err) {
      toast.error(`Couldn't remove every merged worktree: ${String(err)}`);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <section className="setting-group">
      <h2>Worktrees</h2>
      <div className="desc">
        Each ticket's agent works in an isolated checkout under .worktrees/. Merged ones can be
        removed (their branch is deleted too).
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <IconButton label="Refresh" onClick={refresh} disabled={busy !== null}>
          <I.Refresh size={14} />
        </IconButton>
        {removable.length > 0 && (
          <InlineConfirm
            label={
              <>
                <I.Trash size={14} /> Remove {removable.length} merged
              </>
            }
            disabled={busy !== null}
            message={`Remove ${removable.length} merged worktree${removable.length === 1 ? "" : "s"} and their branches?`}
            confirmLabel={`Remove ${removable.length}`}
            onConfirm={() => void removeMerged()}
          />
        )}
      </div>
      {worktrees.length === 0 ? (
        <span className="hint">
          {scanning ? "Scanning repositories…" : "No worktrees right now."}
        </span>
      ) : (
        <div className="repo-list">
          {worktrees.map((wt) => (
            <div key={wt.path} className="repo-row">
              <I.Branch size={14} />
              <span className="repo-name">{wt.name}</span>
              <span className="repo-path">{basename(wt.repo)}</span>
              {wt.running && <span className="wt-chip running">running</span>}
              {wt.merged && <span className="wt-chip merged">merged</span>}
              {wt.dirty && <span className="wt-chip dirty">uncommitted</span>}
              <InlineConfirm
                label={<I.Trash size={12} />}
                className="btn ghost icon xs repo-remove"
                size="xs"
                disabled={wt.running || busy === wt.path}
                ariaLabel={`Remove worktree ${wt.name}`}
                title={wt.running ? "Stop the agent first" : "Remove worktree + branch"}
                message={
                  wt.dirty
                    ? "Has uncommitted changes that will be lost. Remove it and its branch?"
                    : "Remove the worktree and its branch?"
                }
                confirmLabel="Remove"
                onConfirm={() => void remove(wt)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
