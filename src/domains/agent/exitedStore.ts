import { create } from "zustand";
import { useBoardStore } from "@/domains/board/store";
import type { AgentRunState } from "@/ipc/events";

interface ExitedStore {
  /** Workspaces whose agent ended by itself and hasn't been started since. */
  exited: ReadonlySet<string>;
}

// Which stopped agents *exited* — quit (`/exit`, Ctrl+D) or crashed — rather than being
// stopped from trace. Those get a Restart chip where they were: one click resumes the
// conversation. The backend says which it was on the stop event; a reload forgets it,
// and the agent then shows the ordinary Start.
export const useExitedStore = create<ExitedStore>(() => ({ exited: new Set() }));

/** Track one `agent-run-state` event. */
export function noteRunState({ workspaceId, running, exited }: AgentRunState): void {
  const has = useExitedStore.getState().exited.has(workspaceId);
  const isExited = !running && exited === true;
  if (has === isExited) return;
  useExitedStore.setState((s) => {
    const next = new Set(s.exited);
    if (isExited) next.add(workspaceId);
    else next.delete(workspaceId);
    return { exited: next };
  });
}

/** Whether `workspaceId`'s agent exited on its own (and is still stopped). */
export function useHasExited(workspaceId: string): boolean {
  return useExitedStore((s) => s.exited.has(workspaceId));
}

// Starting from the renderer marks a workspace running without a run-state event, so
// drop the mark whenever one comes back to life: its next stop decides afresh.
useBoardStore.subscribe((s, prev) => {
  if (s.runningAgents === prev.runningAgents) return;
  const { exited } = useExitedStore.getState();
  if ([...exited].some((id) => s.runningAgents.has(id))) {
    useExitedStore.setState({
      exited: new Set([...exited].filter((id) => !s.runningAgents.has(id))),
    });
  }
});

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
