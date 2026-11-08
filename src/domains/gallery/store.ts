import { useEffect, useState } from "react";
import { create } from "zustand";
import {
  type GallerySet,
  galleryList,
  galleryRemove,
  gallerySets,
  type Listing,
} from "@/ipc/gallery";
import { galleryTabVisible, listingKey } from "./model";

// Each workspace's Gallery tab in the renderer: its sets as the backend keeps them
// (`gallery::store`), the one in view, whether a set arrived unseen, and whether
// the user opened the tab empty from the pane menu. A set's images aren't kept
// here: the set in view re-lists itself (`useListing`).

const NO_SETS: GallerySet[] = [];
const latestLoad: Record<string, number> = {};
/** How often a set in view is re-listed, which is how new and removed files appear. */
export const RELIST_MS = 2500;

interface GalleryStore {
  sets: Record<string, GallerySet[]>;
  loaded: Record<string, boolean>;
  /** The set in view per workspace; null follows the newest. */
  picked: Record<string, string | null>;
  unseen: Record<string, boolean>;
  revealed: Record<string, boolean>;
  ensure: (ws: string) => void;
  reload: (ws: string) => Promise<void>;
  pick: (ws: string, setId: string | null) => void;
  remove: (ws: string, setId: string) => Promise<void>;
  notify: (ws: string) => void;
  markSeen: (ws: string) => void;
  reveal: (ws: string, on: boolean) => void;
}

export const useGalleryStore = create<GalleryStore>((set, get) => ({
  sets: {},
  loaded: {},
  picked: {},
  unseen: {},
  revealed: {},
  ensure(ws) {
    if (get().loaded[ws]) return;
    set((s) => ({ loaded: { ...s.loaded, [ws]: true } }));
    void get().reload(ws);
  },
  async reload(ws) {
    const ticket = (latestLoad[ws] ?? 0) + 1;
    latestLoad[ws] = ticket;
    const sets = await gallerySets(ws).catch(() => null);
    if (!sets || latestLoad[ws] !== ticket) return;
    set((s) => ({ sets: { ...s.sets, [ws]: sets } }));
  },
  pick(ws, setId) {
    set((s) => ({ picked: { ...s.picked, [ws]: setId } }));
  },
  async remove(ws, setId) {
    await galleryRemove(ws, setId);
    if (get().picked[ws] === setId) get().pick(ws, null);
    await get().reload(ws);
    // The last one gone: the tab goes too, as it came.
    if ((get().sets[ws] ?? NO_SETS).length === 0) get().reveal(ws, false);
  },
  notify(ws) {
    // A new set is shown as it lands.
    set((s) => ({ unseen: { ...s.unseen, [ws]: true }, picked: { ...s.picked, [ws]: null } }));
  },
  markSeen(ws) {
    if (get().unseen[ws]) set((s) => ({ unseen: { ...s.unseen, [ws]: false } }));
  },
  reveal(ws, on) {
    set((s) => ({ revealed: { ...s.revealed, [ws]: on } }));
  },
}));

/** A workspace's sets, newest first (loaded on first use). */
export function useGallerySets(ws: string): GallerySet[] {
  const ensure = useGalleryStore((s) => s.ensure);
  useEffect(() => ensure(ws), [ensure, ws]);
  return useGalleryStore((s) => s.sets[ws] ?? NO_SETS);
}

/**
 * A set's images, re-listed every few seconds while it's on screen. A listing that
 * says the same as the last one isn't passed on, so the grid doesn't redraw.
 */
export function useListing(
  ws: string,
  setId: string
): { listing: Listing | null; error: string | null } {
  const [state, setState] = useState<{ listing: Listing | null; error: string | null }>({
    listing: null,
    error: null,
  });
  useEffect(() => {
    let alive = true;
    let last = "";
    let timer = 0;
    const run = () => {
      void galleryList(ws, setId)
        .then((listing) => {
          if (!alive) return;
          const key = listingKey(listing);
          if (key !== last) {
            last = key;
            setState({ listing, error: null });
          }
        })
        .catch((e: unknown) => {
          if (!alive) return;
          // The next good listing must show, even if it says what the last one did.
          last = "";
          setState({ listing: null, error: String(e) });
        })
        .finally(() => {
          if (alive) timer = window.setTimeout(run, RELIST_MS);
        });
    };
    setState({ listing: null, error: null });
    run();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [ws, setId]);
  return state;
}

/** What the tab row needs: whether Gallery shows, and whether it has news. */
export interface GalleryTabState {
  visible: boolean;
  peeking: boolean;
  unseen: boolean;
  count: number;
}

export function useGalleryTab(ws: string): GalleryTabState {
  const sets = useGallerySets(ws);
  const revealed = useGalleryStore((s) => s.revealed[ws] ?? false);
  const unseen = useGalleryStore((s) => s.unseen[ws] ?? false);
  return {
    visible: galleryTabVisible(sets.length, revealed),
    peeking: revealed && sets.length === 0,
    unseen,
    count: sets.length,
  };
}
