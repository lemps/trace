import type { RemoteRepo, SetupConfig } from "@/domains/repos/types";

// Shapes from `commands/github.rs`. trace signs in with its own GitHub token,
// which stays on the Rust side: none of these carry it.

/** How trace got its token. */
export type GitHubSource = "pasted" | "gh" | "device";

/** The GitHub integration's state. */
export interface GitHubStatus {
  /** Who trace's token belongs to; null when signed out. */
  login: string | null;
  source: GitHubSource | null;
  /** A classic or OAuth token's scopes; null for fine-grained tokens. */
  scopes: string[] | null;
  /** When the token expires, as GitHub reports it. */
  expiresAt: string | null;
  /** gh is installed, so its login can be imported once. */
  ghAvailable: boolean;
  /** Signing in through the browser (OAuth device flow) is set up. */
  deviceFlow: boolean;
  /** Why the saved token isn't working right now. */
  problem: string | null;
}

/** A device sign-in in progress: the code to enter on GitHub. */
export interface DeviceStart {
  userCode: string;
  verificationUri: string;
  /** Seconds until the code expires. */
  expiresIn: number;
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
