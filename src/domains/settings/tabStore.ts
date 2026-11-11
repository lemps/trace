import { create } from "zustand";
import { type LegacySettingsTab, type SettingsTab, settingsTabFor } from "./tabIds";

// A tab another part of the app asks Settings to show (the cheat sheet's
// "Customize…" opens Shortcuts). Settings takes it and clears it; otherwise it keeps
// its own tab, starting on Repositories each time it opens. Old tab ids ("sidebar",
// "updates") still work: they open the tab that took them in.
interface SettingsTabRequest {
  requested: SettingsTab | null;
  request: (tab: SettingsTab | LegacySettingsTab) => void;
  take: () => SettingsTab | null;
}

export const useSettingsTabRequest = create<SettingsTabRequest>((set, get) => ({
  requested: null,
  request: (tab) => set({ requested: settingsTabFor(tab) }),
  take: () => {
    const tab = get().requested;
    if (tab) set({ requested: null });
    return tab;
  },
}));

import.meta.hot?.accept(() => location.reload());
