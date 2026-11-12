import { invoke } from "@tauri-apps/api/core";

/** The workspace a worktree belongs to (`repo_catalog/owners.rs`). */
export interface WorktreeOwner {
  kind: "session" | "ticket" | "prompt";
  /** Its workspace id: session id, issue key or prompt id. */
  id: string;
  /** The session's or prompt's title, or the issue key. */
  label: string;
}

export interface WorktreeInfo {
  repo: string;
  path: string;
  /** Directory name under .worktrees/ — the issue's slug. */
  name: string;
  branch: string | null;
  /** Branch already contained in the default branch — safe to delete. */
  merged: boolean;
  /** Uncommitted changes present (removal would lose work). */
  dirty: boolean;
  /** A live PTY is rooted here — removal is blocked. */
  running: boolean;
  /** Who it belongs to, when trace knows; null shows the dir name. */
  owner: WorktreeOwner | null;
}

/** Every `.worktrees/` checkout across the configured repos, with status. */
export async function listWorktrees(): Promise<WorktreeInfo[]> {
  const list = await invoke<WorktreeInfo[]>("list_worktrees");
  return list.map((wt) => ({ ...wt, owner: wt.owner ?? null }));
}

export function removeWorktree(
  repo: string,
  path: string,
  branch: string | null,
  force: boolean
): Promise<void> {
  return invoke("remove_worktree", { repo, path, branch, force });
}
