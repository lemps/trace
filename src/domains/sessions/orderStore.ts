import { create } from "zustand";
import { toast } from "@/app/toast";
import { listSessionOrder, setSessionList } from "@/ipc/sessionOrder";
import { asSortMode, type SortMode } from "./sortSessions";

// Each Sessions-page list's sort and manual order, mirrored from
// `session-order.json` (`commands/session_order.rs`). Saves are optimistic and
// per list; the backend validates and answers with what it stored, which is
// adopted only if no newer save of that list went out meanwhile.

export interface ListPrefs {
  sort: SortMode;
  order: string[];
}

const DEFAULT: ListPrefs = { sort: "manual", order: [] };

interface OrderStore {
  lists: Record<string, ListPrefs>;
  loaded: boolean;
  load: () => Promise<void>;
  /** Save one list's sort and order. */
  save: (key: string, prefs: ListPrefs) => Promise<void>;
}

/** The list key for a section, or for a tab's unsectioned area. */
export function listKey(tab: string | null, section: string | null): string {
  return section ?? `tab:${tab ?? ""}`;
}

// Latest save per list, so a slow reply can't undo a newer optimistic change.
const latest = new Map<string, number>();
let seq = 0;

export const useSessionOrderStore = create<OrderStore>((set) => ({
  lists: {},
  loaded: false,
  async load() {
    const stored = await listSessionOrder();
    const lists: Record<string, ListPrefs> = {};
    for (const [key, l] of Object.entries(stored.lists ?? {})) {
      lists[key] = { sort: asSortMode(l.sort), order: Array.isArray(l.order) ? l.order : [] };
    }
    set({ lists, loaded: true });
  },
  async save(key, prefs) {
    const mine = ++seq;
    latest.set(key, mine);
    const before = useSessionOrderStore.getState().lists[key];
    set((s) => ({ lists: { ...s.lists, [key]: prefs } }));
    try {
      const stored = await setSessionList(key, prefs.sort, prefs.order);
      if (latest.get(key) !== mine) return;
      set((s) => ({
        lists: { ...s.lists, [key]: { sort: asSortMode(stored.sort), order: stored.order } },
      }));
    } catch (err) {
      if (latest.get(key) !== mine) return;
      set((s) => ({ lists: { ...s.lists, [key]: before ?? DEFAULT } }));
      toast.error(`Couldn't save the order: ${String(err)}`);
    }
  },
}));

/** A list's prefs, Manual with no saved order until it has some. */
export function useListPrefs(key: string): ListPrefs {
  return useSessionOrderStore((s) => s.lists[key] ?? DEFAULT);
}

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
