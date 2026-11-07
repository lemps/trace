import { create } from "zustand";

export type SettingsTab =
  | "agents"
  | "notifications"
  | "assistant"
  | "appearance"
  | "sidebar"
  | "shortcuts"
  | "worktrees"
  | "updates";

// A tab another part of the app asks Settings to show (the cheat sheet's
// "Customize…" opens Shortcuts). Settings takes it and clears it; otherwise it keeps
// its own tab, starting on Agents each time it opens.
interface SettingsTabRequest {
  requested: SettingsTab | null;
  request: (tab: SettingsTab) => void;
  take: () => SettingsTab | null;
}

export const useSettingsTabRequest = create<SettingsTabRequest>((set, get) => ({
  requested: null,
  request: (tab) => set({ requested: tab }),
  take: () => {
    const tab = get().requested;
    if (tab) set({ requested: null });
    return tab;
  },
}));
