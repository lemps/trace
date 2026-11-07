import { create } from "zustand";

// Which tabs each mounted detail's layout holds right now, so a view outside the
// pane system can tell whether one of its views has a pane of its own (a chat
// doesn't also show, as its own tab, a subagent that's open beside it). Only
// details on screen publish: a stored layout of a closed detail doesn't count.

interface ShownPanels {
  byScope: Record<string, readonly string[]>;
  publish: (scope: string, tabs: readonly string[] | null) => void;
}

export const useShownPanels = create<ShownPanels>((set) => ({
  byScope: {},
  publish(scope, tabs) {
    set((s) => {
      const { [scope]: was, ...rest } = s.byScope;
      if (tabs === null) return was ? { byScope: rest } : s;
      if (was && was.length === tabs.length && was.every((t, i) => t === tabs[i])) return s;
      return { byScope: { ...rest, [scope]: tabs } };
    });
  },
}));

const shownIn = (byScope: ShownPanels["byScope"], id: string) =>
  Object.values(byScope).some((tabs) => tabs.includes(id));

/** Whether a panel is in the layout of a detail on screen. */
export function isPanelShown(id: string): boolean {
  return shownIn(useShownPanels.getState().byScope, id);
}

/** The ids, of those given, that are in a layout on screen (stable while unchanged). */
export function useShownOf(ids: readonly string[]): string {
  return useShownPanels((s) => ids.filter((id) => shownIn(s.byScope, id)).join("\n"));
}
