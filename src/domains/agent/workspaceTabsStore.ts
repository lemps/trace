import { create } from "zustand";

// How many files each workspace's worktree has changed, as last read: the Files tab
// has content while it's above 0 (the tabs rule, panes/coming.ts). Read by the
// Files pane while it shows, and by `useChangeWatch` while it's hidden.

interface WorkspaceTabsStore {
  changes: Record<string, number>;
  setChanges: (ws: string, count: number) => void;
}

export const useWorkspaceTabsStore = create<WorkspaceTabsStore>((set) => ({
  changes: {},
  setChanges(ws, count) {
    set((s) => (s.changes[ws] === count ? s : { changes: { ...s.changes, [ws]: count } }));
  },
}));

import.meta.hot?.accept(() => location.reload());
