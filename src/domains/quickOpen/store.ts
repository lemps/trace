import { create } from "zustand";

/** A file Quick Open asked the Files tab to show. `nonce` re-reveals the same path. */
export interface Reveal {
  path: string;
  nonce: number;
}

interface QuickOpenStore {
  /** The last file picked per workspace id; the Files tab selects it when it changes. */
  reveals: Record<string, Reveal>;
  reveal: (workspaceId: string, path: string) => void;
  /** The workspace whose picker is up, if any. */
  openFor: string | null;
  show: (workspaceId: string) => void;
  hide: () => void;
}

let nonce = 0;

// Quick Open hands its pick to the Files tab through here: the tab may not be mounted
// yet when the pick is made (switching to it is what mounts it).
export const useQuickOpenStore = create<QuickOpenStore>((set) => ({
  reveals: {},
  openFor: null,
  show(workspaceId) {
    set({ openFor: workspaceId });
  },
  hide() {
    set({ openFor: null });
  },
  reveal(workspaceId, path) {
    nonce += 1;
    set((s) => ({ reveals: { ...s.reveals, [workspaceId]: { path, nonce } } }));
  },
}));

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
