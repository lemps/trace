import type { RemoteRepo, SetupConfig } from "@/domains/repos/types";

// Shapes from `commands/github.rs`. trace holds no GitHub token: all of this comes
// from the user's `gh` CLI.

/** The GitHub integration's state. */
export interface GhStatus {
  /** `gh` was found. */
  installed: boolean;
  /** The active, working github.com account. */
  login: string | null;
  /** Every signed-in login, active first. */
  accounts: string[];
  /** Why there's no working account when gh lists one (e.g. an expired token). */
  problem: string | null;
}

/** A repo in the browser. */
export interface GhRepo {
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  url: string;
  defaultBranch: string | null;
  /** ISO 8601. */
  updatedAt: string;
  language: string | null;
  /** The configured repo that's already a checkout of it. */
  localPath: string | null;
}

/** A finished checkout, added to trace's repositories. */
export interface Cloned {
  path: string;
  remote: RemoteRepo;
  defaultBranch: string;
  /** The setup saved for this repo before, else a guess from its lockfiles. */
  suggestedSetup: SetupConfig;
  /** The folder already held this repo, so nothing was cloned. */
  alreadyPresent: boolean;
}
