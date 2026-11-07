import { create } from "zustand";

// Whether the keyboard cheat sheet is up. Opened by its keys, the rail's keyboard
// button and the search palette's "Keyboard shortcuts".
interface CheatSheetState {
  open: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
}

export const useCheatSheet = create<CheatSheetState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
