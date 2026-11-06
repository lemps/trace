import { create } from "zustand";
import { githubOwners, githubRepos, githubStatus } from "@/ipc/github";
import type { GhRepo, GhStatus } from "./types";

// The GitHub integration: whether `gh` is signed in, and the repo lists the
// browser has fetched (per owner, so switching back to one is instant).

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
  loadOwners: () => Promise<void>;
  /** Fetch an owner's repos; `force` refetches a cached list. */
  loadRepos: (owner: string, force?: boolean) => Promise<void>;
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

  loadOwners: async () => {
    try {
      set({ owners: await githubOwners() });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  loadRepos: async (owner, force = false) => {
    if (!force && get().repos[owner]) return;
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
