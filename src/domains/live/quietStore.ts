import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAgentChatStore } from "@/domains/agentChat/store";
import { useBoardStore } from "@/domains/board/store";
import { turnMemory } from "@/domains/board/waitingNotify";
import { groupQuiet, isQuiet } from "./quiet";
import { useLiveStore } from "./store";

// Which working agents have gone quiet (`quiet.ts`): when trace last heard from
// each — a terminal agent's output, a chat agent's rows or info, a hook — and,
// on a slow tick, which of the working ones that was too long ago. In memory
// only: a reload starts every agent's clock again, which errs towards Working.
// The board and chat store imports are circular through `sync.ts`; this only
// touches them inside functions.

/** How often to look for agents that have gone quiet. */
const TICK_MS = 30 * 1000;

/** Nothing is older than this module: a reload doesn't make every agent quiet at once. */
const loadedAt = Date.now();
const heardAt = new Map<string, number>();

interface QuietStore {
  /** Workspace ids of working agents that have gone quiet. */
  ids: readonly string[];
}

export const useQuietStore = create<QuietStore>(() => ({ ids: [] }));

/** A chat agent busy only with subagents after its turn ended. */
function chatInBackground(workspaceId: string): boolean {
  const info = useAgentChatStore.getState().info[workspaceId];
  return info !== undefined && !info.busy && (info.runningSubagents ?? 0) > 0;
}

function recount() {
  const now = Date.now();
  const live = useLiveStore.getState().info;
  // A stopped agent's clock goes with it (a restart is a new `since` anyway).
  for (const id of heardAt.keys()) if (!(id in live)) heardAt.delete(id);
  const ids = Object.entries(live)
    .filter(([id, info]) =>
      isQuiet({
        light: info.light,
        heardAt: Math.max(heardAt.get(id) ?? 0, info.since, loadedAt),
        background: turnMemory(id).backgroundTasks > 0 || chatInBackground(id),
        now,
      })
    )
    .map(([id]) => id);
  const prev = useQuietStore.getState().ids;
  if (ids.length !== prev.length || ids.some((id, i) => id !== prev[i])) {
    useQuietStore.setState({ ids });
  }
}

/** Trace heard from this agent (a hook, say): it isn't quiet. */
export function noteHeard(workspaceId: string): void {
  heardAt.set(workspaceId, Date.now());
  if (useQuietStore.getState().ids.includes(workspaceId)) recount();
}

/** Keys whose value changed between two per-workspace maps. */
function changedKeys<T>(next: Record<string, T>, prev: Record<string, T>): string[] {
  return Object.keys(next).filter((id) => next[id] !== prev[id]);
}

/** Start listening (from `useLiveSync`). Returns the unsubscribe. */
export function watchQuiet(): () => void {
  const offBoard = useBoardStore.subscribe((s, prev) => {
    if (s.outputBuffers !== prev.outputBuffers) {
      for (const id of changedKeys(s.outputBuffers, prev.outputBuffers)) noteHeard(id);
    }
  });
  const offChat = useAgentChatStore.subscribe((s, prev) => {
    if (s.journals !== prev.journals) {
      for (const id of changedKeys(s.journals, prev.journals)) noteHeard(id);
    }
    if (s.info !== prev.info) {
      for (const id of changedKeys(s.info, prev.info)) noteHeard(id);
    }
  });
  // A light changing (to or from Working) is news too: `since` covers it.
  const offLive = useLiveStore.subscribe((s, prev) => {
    if (s.info !== prev.info) recount();
  });
  const timer = setInterval(recount, TICK_MS);
  return () => {
    offBoard();
    offChat();
    offLive();
    clearInterval(timer);
    heardAt.clear();
  };
}

/** Whether this agent's Working has gone quiet. */
export function useAgentQuiet(workspaceId: string): boolean {
  return useQuietStore((s) => s.ids.includes(workspaceId));
}

/** Whether a group's Working (a session and its companions) has gone quiet. */
export function useGroupQuiet(workspaceIds: readonly string[]): boolean {
  // Shallow-compared, so a row re-renders only when one of its own agents changes.
  const lights = useLiveStore(
    useShallow((s) => workspaceIds.map((id) => s.info[id]?.light ?? "stopped"))
  );
  const quiet = useQuietStore(useShallow((s) => workspaceIds.map((id) => s.ids.includes(id))));
  return groupQuiet(lights.map((light, i) => ({ light, quiet: quiet[i] ?? false })));
}

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
