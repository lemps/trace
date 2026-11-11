import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { RepoDetails, SetupConfig } from "@/domains/repos/types";

// Per-repo details and worktree setup (`commands/repo_setup.rs`).

/** Each configured repo's details. A build from before `exists` reads as present. */
export async function repoDetails(): Promise<RepoDetails[]> {
  const list = await invoke<RepoDetails[]>("repo_details");
  return list.map((d) => ({ ...d, exists: d.exists !== false }));
}

/** Save what runs in each new worktree of the repo at `path`; returns it cleaned. */
export function setRepoSetup(path: string, setup: SetupConfig): Promise<SetupConfig> {
  return invoke("set_repo_setup", { path, setup });
}

/** Pick the GitHub account a sandbox clones and pushes the repo at `path` as; null is automatic. */
export function setRepoGitHubAccount(path: string, login: string | null): Promise<void> {
  return invoke("set_repo_github_account", { path, login });
}

/** A first guess at the setup, from the repo's lockfiles. */
export function suggestRepoSetup(path: string): Promise<SetupConfig> {
  return invoke("suggest_repo_setup", { path });
}

/** The folder new clones go in. */
export function cloneRoot(): Promise<string> {
  return invoke("clone_root");
}

export function setCloneRoot(path: string): Promise<string> {
  return invoke("set_clone_root", { path });
}

/** Progress of a repo's setup in a worktree trace just created. */
export interface WorktreeSetupEvent {
  repo: string;
  worktree: string;
  state: "running" | "done" | "failed";
  /** failed: the command or copy that failed. */
  step: string | null;
  /** failed: the end of its output. */
  output: string | null;
}

export function onWorktreeSetup(cb: (payload: WorktreeSetupEvent) => void): Promise<UnlistenFn> {
  return listen<WorktreeSetupEvent>("worktree-setup", (e) => cb(e.payload));
}
