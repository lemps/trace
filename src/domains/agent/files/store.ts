import { useCallback } from "react";
import { create } from "zustand";

// The Files tab's view state, per workspace, for as long as the app runs: which
// mode, which file is open, which folders are open, the filter. Leaving the tab (or
// the agent) and coming back finds it as it was. The sidebar's width is one value
// for every workspace, kept across restarts.

export type FilesMode = "changes" | "all";

export interface FilesView {
  /** Unset until chosen: then Changes when there are any, else All files. */
  mode?: FilesMode;
  /** Changes as a flat list instead of a tree. */
  flat: boolean;
  /** The file in the viewer. */
  selected: string | null;
  /** Folders closed in the Changes tree (it starts fully open: changes are few). */
  changesClosed: ReadonlySet<string>;
  /** Folders open in the All files tree (it starts closed: repos are big). */
  allOpen: ReadonlySet<string>;
  filter: string;
}

/**
 * The mode a workspace shows until the user picks one: Changes when it has any,
 * else All files (also when the changes can't be worked out, say with no remote).
 */
export function effectiveMode(
  chosen: FilesMode | undefined,
  changeCount: number | null,
  changesFailed: boolean
): FilesMode {
  if (chosen) return chosen;
  return changeCount === 0 || (changeCount === null && changesFailed) ? "all" : "changes";
}

const EMPTY: FilesView = {
  flat: false,
  selected: null,
  changesClosed: new Set(),
  allOpen: new Set(),
  filter: "",
};

interface FilesStore {
  views: Record<string, FilesView>;
  patch: (workspaceId: string, patch: Partial<FilesView>) => void;
}

export const useFilesStore = create<FilesStore>((set) => ({
  views: {},
  patch(workspaceId, patch) {
    set((s) => ({
      views: { ...s.views, [workspaceId]: { ...(s.views[workspaceId] ?? EMPTY), ...patch } },
    }));
  },
}));

/** One workspace's view state, and a setter for part of it. */
export function useFilesView(workspaceId: string): [FilesView, (p: Partial<FilesView>) => void] {
  const view = useFilesStore((s) => s.views[workspaceId]) ?? EMPTY;
  const patch = useFilesStore((s) => s.patch);
  const patchThis = useCallback(
    (p: Partial<FilesView>) => patch(workspaceId, p),
    [patch, workspaceId]
  );
  return [view, patchThis];
}

/** `set` with `key` added or taken out. */
export function withKey(set: ReadonlySet<string>, key: string, present: boolean): Set<string> {
  const next = new Set(set);
  if (present) next.add(key);
  else next.delete(key);
  return next;
}

// ---- Sidebar width (shared, persisted) ----

const WIDTH_KEY = "trace.filesSidebarWidth";
export const SIDEBAR_DEFAULT = 280;
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 640;

export const clampWidth = (w: number) =>
  Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));

function storedWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(n) && n > 0 ? clampWidth(n) : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

interface WidthStore {
  width: number;
  /** Set while dragging; `save` writes it once the drag ends. */
  setWidth: (w: number) => void;
  save: () => void;
}

export const useSidebarWidth = create<WidthStore>((set, get) => ({
  width: storedWidth(),
  setWidth: (w) => set({ width: clampWidth(w) }),
  save() {
    try {
      localStorage.setItem(WIDTH_KEY, String(get().width));
    } catch {
      // Best-effort: the width still applies until the app closes.
    }
  },
}));

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
