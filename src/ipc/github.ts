import { invoke } from "@tauri-apps/api/core";
import type { Cloned, DeviceStart, GhRepo, GitHubStatus } from "@/domains/github/types";

// The GitHub integration (`commands/github.rs`). trace keeps its own GitHub token
// on the Rust side; nothing here returns it.

export function githubStatus(): Promise<GitHubStatus> {
  return invoke("github_status");
}

/** Check a pasted personal access token and keep it. */
export function githubSignInToken(token: string): Promise<GitHubStatus> {
  return invoke("github_sign_in_token", { token });
}

/** Copy the gh CLI's token once. */
export function githubImportGh(): Promise<GitHubStatus> {
  return invoke("github_import_gh");
}

export function githubDeviceStart(): Promise<DeviceStart> {
  return invoke("github_device_start");
}

/** Resolves once the user approves the code on GitHub. */
export function githubDeviceWait(): Promise<GitHubStatus> {
  return invoke("github_device_wait");
}

export function githubDeviceCancel(): Promise<void> {
  return invoke("github_device_cancel");
}

/** Delete trace's GitHub token. */
export function githubSignOut(): Promise<void> {
  return invoke("github_sign_out");
}

/** The signed-in user (`login`, from `githubStatus`), then their orgs. */
export function githubOwners(login: string): Promise<string[]> {
  return invoke("github_owners", { login });
}

/** An owner's repos (the user's own when null), most recently pushed first. */
export function githubRepos(owner: string | null): Promise<GhRepo[]> {
  return invoke("github_repos", { owner });
}

/** Clone into the clone folder and add it to trace's repositories. */
export function githubClone(fullName: string): Promise<Cloned> {
  return invoke("github_clone", { fullName });
}
