// The repo model, mirrored from `repo_catalog` in Rust. A repo is identified by its
// remote and can have several checkouts; today they're all local folders (the
// entries in Settings → Repositories), and remote execution will add other kinds.

/** Where a repo is hosted, e.g. github.com / noble1911 / trace. */
export interface RemoteRepo {
  host: string;
  owner: string;
  name: string;
}

/** What makes a new worktree ready for an agent; runs once, right after it's created. */
export interface SetupConfig {
  /** Untracked files (like `.env`) copied from the main checkout, relative to its root. */
  copyFiles: string[];
  /** Shell command lines run in order in the new worktree; the first failure stops. */
  commands: string[];
}

/** A configured repo, as Settings shows it. */
export interface RepoDetails {
  /** The local checkout agents run in. */
  path: string;
  remote: RemoteRepo | null;
  defaultBranch: string;
  setup: SetupConfig;
  /** The GitHub account picked for it in Settings; null = automatic. */
  githubAccount: string | null;
}

/** `owner/name`. */
export function fullName(remote: RemoteRepo): string {
  return `${remote.owner}/${remote.name}`;
}

export const EMPTY_SETUP: SetupConfig = { copyFiles: [], commands: [] };

export function isEmptySetup(setup: SetupConfig): boolean {
  return setup.copyFiles.length === 0 && setup.commands.length === 0;
}
