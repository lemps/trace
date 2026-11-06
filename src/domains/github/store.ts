import { create } from "zustand";
import { githubOwners, githubRepos, githubStatus } from "@/ipc/github";
import type { GhRepo, GhStatus } from "./types";

// The GitHub integration: whether `gh` is signed in, and the repo lists the
// browser has fetched. Kept per owner so a list shows at once, and refetched each
// time the browser opens, so "In trace" and new repos don't go stale.

interface GitHubStore {
  /** Null until the first check. */
  status: GhStatus | null;
  checking: boolean;
  owners: string[];
  /** Owner login → its repos. */
  repos: Record<string, GhRepo[]>;
  loadingOwner: string | null;
  error: string | null;

  checkStatus: () => Promise<void>;
  loadOwners: (login: string) => Promise<void>;
  /** Fetch an owner's repos, showing the cached list meanwhile. */
  loadRepos: (owner: string) => Promise<void>;
  /** Mark a repo as checked out at `path`, after a clone. */
  markLocal: (fullName: string, path: string) => void;
}

export const useGitHubStore = create<GitHubStore>((set, get) => ({
  status: null,
  checking: false,
  owners: [],
  repos: {},
  loadingOwner: null,
  error: null,

  checkStatus: async () => {
    set({ checking: true });
    try {
      set({ status: await githubStatus() });
    } catch (err) {
      set({ status: { installed: false, login: null, accounts: [], problem: String(err) } });
    } finally {
      set({ checking: false });
    }
  },

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
      // The signed-in user's own list is fetched without naming them, as gh expects.
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
