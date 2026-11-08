import { create } from "zustand";
import {
  githubImportGh,
  githubOwners,
  githubRepos,
  githubSignInToken,
  githubSignOut,
  githubStatus,
  removeGitHubAccount,
  setPrimaryGitHubAccount,
} from "@/ipc/github";
import type { GhRepo, GitHubStatus } from "./types";

// The GitHub integration: the accounts trace's own tokens are signed in as (the
// primary one first), and the repo lists the browser has fetched for the primary. Kept per owner so a list shows at once, and refetched each
// time the browser opens, so "In trace" and new repos don't go stale.

interface GitHubStore {
  /** Null until the first check. */
  status: GitHubStatus | null;
  checking: boolean;
  /** A sign-in (paste or gh import) is being checked with GitHub. */
  signingIn: boolean;
  signInError: string | null;
  owners: string[];
  /** Owner login → its repos. */
  repos: Record<string, GhRepo[]>;
  loadingOwner: string | null;
  error: string | null;

  checkStatus: () => Promise<void>;
  /** Adopt a status a sign-in returned. */
  setStatus: (status: GitHubStatus) => void;
  /** Add (or renew) an account from a pasted token; resolves whether it worked. */
  signInToken: (token: string) => Promise<boolean>;
  /** Add every account gh is signed in to; resolves whether it worked. */
  importGh: () => Promise<boolean>;
  /** Remove every account. */
  signOut: () => Promise<void>;
  /** Remove one account; rejects with the reason. */
  removeAccount: (login: string) => Promise<void>;
  /** Make one account primary; rejects with the reason. */
  setPrimary: (login: string) => Promise<void>;
  loadOwners: (login: string) => Promise<void>;
  /** Fetch an owner's repos, showing the cached list meanwhile. */
  loadRepos: (owner: string) => Promise<void>;
  /** Mark a repo as checked out at `path`, after a clone. */
  markLocal: (fullName: string, path: string) => void;
}

const SIGNED_OUT: GitHubStatus = {
  login: null,
  source: null,
  scopes: null,
  expiresAt: null,
  ghAvailable: false,
  deviceFlow: false,
  problem: null,
  accounts: [],
};

/** Run a sign-in, keeping its result or its error; resolves whether it worked. */
async function signIn(run: () => Promise<GitHubStatus>): Promise<boolean> {
  const { setState, getState } = useGitHubStore;
  setState({ signingIn: true, signInError: null });
  try {
    getState().setStatus(await run());
    return true;
  } catch (err) {
    setState({ signInError: String(err) });
    return false;
  } finally {
    setState({ signingIn: false });
  }
}

export const useGitHubStore = create<GitHubStore>((set, get) => ({
  status: null,
  checking: false,
  signingIn: false,
  signInError: null,
  owners: [],
  repos: {},
  loadingOwner: null,
  error: null,

  checkStatus: async () => {
    set({ checking: true });
    try {
      set({ status: await githubStatus() });
    } catch (err) {
      set({ status: { ...SIGNED_OUT, problem: String(err) } });
    } finally {
      set({ checking: false });
    }
  },

  setStatus: (status) => set({ status, signInError: null, owners: [], repos: {}, error: null }),

  signInToken: (token) => signIn(() => githubSignInToken(token)),
  importGh: () => signIn(githubImportGh),

  signOut: async () => {
    try {
      await githubSignOut();
      const prev = get().status;
      get().setStatus({
        ...SIGNED_OUT,
        ghAvailable: prev?.ghAvailable ?? false,
        deviceFlow: prev?.deviceFlow ?? false,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  removeAccount: async (login) => get().setStatus(await removeGitHubAccount(login)),
  setPrimary: async (login) => get().setStatus(await setPrimaryGitHubAccount(login)),

  loadOwners: async (login) => {
    try {
      set({ owners: await githubOwners(login) });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  loadRepos: async (owner) => {
    set({ loadingOwner: owner, error: null });
    try {
      // The signed-in user's own list is `/user/repos`, which includes private ones.
      const isSelf = owner === get().status?.login;
      const list = await githubRepos(isSelf ? null : owner);
      set((s) => ({ repos: { ...s.repos, [owner]: list } }));
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set((s) => (s.loadingOwner === owner ? { loadingOwner: null } : {}));
    }
  },

  markLocal: (fullName, path) =>
    set((s) => ({
      repos: Object.fromEntries(
        Object.entries(s.repos).map(([owner, list]) => [
          owner,
          list.map((r) => (r.fullName === fullName ? { ...r, localPath: path } : r)),
        ])
      ),
    })),
}));

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
