import { create } from "zustand";
import type { PaneLayout } from "./model";
import { parseLayout } from "./validate";

// Each workspace's pane layout (a session's, a ticket's). An arranged one — split, or
// its tabs reordered — is remembered across launches like the app's other UI prefs,
// with which tab each pane shows. One that's only had tabs picked keeps that for this
// run and stores nothing, so it doesn't count as arranged or take a slot. Old entries
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
  /** This run's layouts of workspaces that aren't arranged. */
  picked: Record<string, PaneLayout>;
  /** Remember a layout: stored if `arranged`, else for this run only. */
  save: (scope: string, layout: PaneLayout, arranged: boolean) => void;
  /** Forget a workspace's arrangement: back to the single tab row. */
  reset: (scope: string) => void;
}

export const usePaneLayoutStore = create<PaneLayoutStore>((set) => ({
  saved: load(),
  picked: {},
  save(scope, layout, arranged) {
    set((s) => {
      const { [scope]: _was, ...picked } = s.picked;
      if (arranged) {
        return { picked, saved: persist({ ...s.saved, [scope]: { layout, at: Date.now() } }) };
      }
      const { [scope]: _stored, ...saved } = s.saved;
      return {
        picked: { ...picked, [scope]: layout },
        saved: scope in s.saved ? persist(saved) : s.saved,
      };
    });
  },
  reset(scope) {
    set((s) => {
      const { [scope]: _gone, ...saved } = s.saved;
      const { [scope]: _picked, ...picked } = s.picked;
      return { picked, saved: scope in s.saved ? persist(saved) : s.saved };
    });
  },
}));

/** A workspace's current layout, if it has one: arranged, or picked this run. */
export function storedLayout(s: PaneLayoutStore, scope: string): PaneLayout | null {
  return s.saved[scope]?.layout ?? s.picked[scope] ?? null;
}
