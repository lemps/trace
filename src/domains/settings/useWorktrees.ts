import { useCallback, useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { listWorktrees, removeWorktree, type WorktreeInfo } from "@/ipc/worktrees";
import { worktreeName } from "./worktreeModel";

export interface WorktreesState {
  worktrees: WorktreeInfo[];
  /** A scan is running (the first, or a refresh: the list stays meanwhile). */
  scanning: boolean;
  /** The last scan failed: the list may be stale or empty for that reason. */
  failed: boolean;
  /** The path being removed, or "*" while "Remove N merged" runs. */
  busy: string | null;
  refresh: () => void;
  remove: (wt: WorktreeInfo) => Promise<void>;
  removeAll: (list: WorktreeInfo[]) => Promise<void>;
}

// Every `.worktrees/` checkout across the configured repos, and removing them.
// A failed scan is a toast and an honest line, never "No worktrees right now."
export function useWorktrees(onRemoved?: () => void): WorktreesState {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [scanning, setScanning] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setScanning(true);
    listWorktrees()
      .then((list) => {
        setWorktrees(list);
        setFailed(false);
      })
      .catch((err) => {
        setFailed(true);
        toast.error(`Couldn't list the worktrees: ${String(err)}`);
      })
      .finally(() => setScanning(false));
  }, []);
  useEffect(refresh, [refresh]);

  const remove = async (wt: WorktreeInfo) => {
    setBusy(wt.path);
    try {
      await removeWorktree(wt.repo, wt.path, wt.branch, wt.dirty);
    } catch (err) {
      toast.error(`Couldn't remove ${worktreeName(wt).text}: ${String(err)}`);
    } finally {
      setBusy(null);
      refresh();
      onRemoved?.();
    }
  };

  const removeAll = async (list: WorktreeInfo[]) => {
    setBusy("*");
    try {
      for (const wt of list) await removeWorktree(wt.repo, wt.path, wt.branch, false);
    } catch (err) {
      toast.error(`Couldn't remove every merged worktree: ${String(err)}`);
    } finally {
      setBusy(null);
      refresh();
      onRemoved?.();
    }
  };

  return { worktrees, scanning, failed, busy, refresh, remove, removeAll };
}
