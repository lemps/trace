import { create } from "zustand";
import type { PaneLayout } from "./model";
import { parseLayout } from "./validate";

// Each workspace's pane layout (a session's, a ticket's), remembered across visits
// and launches like the app's other UI prefs. Only what the user arranged is stored;
// a workspace never touched has no entry and shows the single tab row. Old entries
// age out so the list can't grow without end.

const KEY = "trace.paneLayouts";
/** Workspaces remembered; the least recently arranged go first. */
const KEEP = 100;

interface Saved {
  layout: PaneLayout;
  /** When it was last arranged, for ageing out. */
  at: number;
}

function load(): Record<string, Saved> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (typeof raw !== "object" || raw === null) return {};
    const out: Record<string, Saved> = {};
    for (const [scope, entry] of Object.entries(raw)) {
      if (typeof entry !== "object" || entry === null) continue;
      const { layout, at } = entry as { layout?: unknown; at?: unknown };
      const parsed = parseLayout(layout);
      if (parsed) out[scope] = { layout: parsed, at: typeof at === "number" ? at : 0 };
    }
    return out;
  } catch {
    return {};
  }
}

function persist(saved: Record<string, Saved>): Record<string, Saved> {
  const entries = Object.entries(saved).sort((a, b) => b[1].at - a[1].at);
  const kept = Object.fromEntries(entries.slice(0, KEEP));
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // best-effort: the layout still applies this run
  }
  return kept;
}

interface PaneLayoutStore {
  saved: Record<string, Saved>;
  save: (scope: string, layout: PaneLayout) => void;
  /** Forget a workspace's arrangement: back to the single tab row. */
  reset: (scope: string) => void;
}

export const usePaneLayoutStore = create<PaneLayoutStore>((set) => ({
  saved: load(),
  save(scope, layout) {
    set((s) => ({ saved: persist({ ...s.saved, [scope]: { layout, at: Date.now() } }) }));
  },
  reset(scope) {
    set((s) => {
      if (!(scope in s.saved)) return s;
      const { [scope]: _gone, ...rest } = s.saved;
      return { saved: persist(rest) };
    });
  },
}));

/** A workspace's stored layout, if it has one. */
export function useSavedLayout(scope: string): PaneLayout | null {
  return usePaneLayoutStore((s) => s.saved[scope]?.layout ?? null);
}
