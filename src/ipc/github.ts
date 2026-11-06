import { invoke } from "@tauri-apps/api/core";
import type { Cloned, GhRepo, GhStatus } from "@/domains/github/types";

// The GitHub integration (`commands/github.rs`), all through the user's `gh` CLI.

export function githubStatus(): Promise<GhStatus> {
  return invoke("github_status");
}

/** The signed-in user, then their orgs. */
export function githubOwners(): Promise<string[]> {
  return invoke("github_owners");
}

/** An owner's repos (the user's own when null), most recently updated first. */
export function githubRepos(owner: string | null): Promise<GhRepo[]> {
  return invoke("github_repos", { owner });
}

/** Clone into the clone folder and add it to trace's repositories. */
export function githubClone(fullName: string): Promise<Cloned> {
  return invoke("github_clone", { fullName });
}
