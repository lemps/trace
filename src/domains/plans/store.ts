import { useEffect } from "react";
import { create } from "zustand";
import { loadPlanDocs, type PlanDoc, removePlanDoc, type TaskList } from "@/ipc/plans";
import { hasUnseen, newestAt, planTabVisible } from "./model";

// Each workspace's Plan tab in the renderer: its documents and task list as the
// backend has them (`plans`), when the user last looked, and whether they opened
// it empty from the pane menu. The backend is the source of truth: this reloads a
// workspace whenever a document lands, so trimmed versions go here too.

const NO_DOCS: PlanDoc[] = [];
const SEEN_KEY = "trace.planSeen";

function loadSeen(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
    if (typeof raw !== "object" || raw === null) return {};
    return Object.fromEntries(
      Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === "number")
    );
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, number>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // A view preference: fine to lose.
  }
}

interface PlanStore {
  docs: Record<string, PlanDoc[]>;
  tasks: Record<string, TaskList | null>;
  loaded: Record<string, boolean>;
  /** Newest document time the user has seen, per workspace. */
  seen: Record<string, number>;
  /** Opened empty from the pane menu, until closed. */
  revealed: Record<string, boolean>;
  ensure: (workspaceId: string) => void;
  reload: (workspaceId: string) => Promise<void>;
  setTasks: (workspaceId: string, tasks: TaskList) => void;
  remove: (workspaceId: string, id: string, allVersions: boolean) => Promise<void>;
  markSeen: (workspaceId: string) => void;
  reveal: (workspaceId: string, on: boolean) => void;
}

export const usePlanStore = create<PlanStore>((set, get) => ({
  docs: {},
  tasks: {},
  loaded: {},
  seen: loadSeen(),
  revealed: {},
  ensure(workspaceId) {
    if (get().loaded[workspaceId]) return;
    set((s) => ({ loaded: { ...s.loaded, [workspaceId]: true } }));
    void get().reload(workspaceId);
  },
  async reload(workspaceId) {
    const state = await loadPlanDocs(workspaceId).catch(() => null);
    if (!state) return;
    set((s) => ({
      docs: { ...s.docs, [workspaceId]: state.docs },
      tasks: { ...s.tasks, [workspaceId]: state.tasks },
      loaded: { ...s.loaded, [workspaceId]: true },
    }));
  },
  setTasks(workspaceId, tasks) {
    set((s) => ({ tasks: { ...s.tasks, [workspaceId]: tasks } }));
  },
  async remove(workspaceId, id, allVersions) {
    await removePlanDoc(workspaceId, id, allVersions);
    await get().reload(workspaceId);
    // The last one gone: the tab goes too, as it came.
    if ((get().docs[workspaceId] ?? NO_DOCS).length === 0) get().reveal(workspaceId, false);
  },
  markSeen(workspaceId) {
    const at = newestAt(get().docs[workspaceId] ?? NO_DOCS);
    if ((get().seen[workspaceId] ?? -1) >= at) return;
    const seen = { ...get().seen, [workspaceId]: at };
    saveSeen(seen);
    set({ seen });
  },
  reveal(workspaceId, on) {
    set((s) => ({ revealed: { ...s.revealed, [workspaceId]: on } }));
  },
}));

/** A workspace's documents (loaded on first use). */
export function usePlanDocs(workspaceId: string): PlanDoc[] {
  const ensure = usePlanStore((s) => s.ensure);
  useEffect(() => ensure(workspaceId), [ensure, workspaceId]);
  return usePlanStore((s) => s.docs[workspaceId] ?? NO_DOCS);
}

export function usePlanTasks(workspaceId: string): TaskList | null {
  return usePlanStore((s) => s.tasks[workspaceId] ?? null);
}

/** What the tab row needs: whether Plan shows, and whether it has news. */
export interface PlanTabState {
  visible: boolean;
  /** Shown only because the user opened it empty: its tab closes it again. */
  peeking: boolean;
  unseen: boolean;
  count: number;
}

export function usePlanTab(workspaceId: string): PlanTabState {
  const docs = usePlanDocs(workspaceId);
  const tasks = usePlanTasks(workspaceId);
  const revealed = usePlanStore((s) => s.revealed[workspaceId] ?? false);
  const seenAt = usePlanStore((s) => s.seen[workspaceId] ?? null);
  const content = { docs: docs.length, tasks };
  const filled = planTabVisible(content, false);
  return {
    visible: planTabVisible(content, revealed),
    peeking: revealed && !filled,
    unseen: hasUnseen(docs, seenAt),
    count: new Set(docs.map((d) => d.series)).size,
  };
}
