import { create } from "zustand";

// Subagent tabs closed in a detail's pane strip, per agent workspace (the tabs:
// `subagentPanel.tsx`). Closing hides the tab only: the subagent's conversation
// stays, and its card in the agent's chat, or Open beside, brings it back. Kept
// across restarts (the journal brings every subagent back), as a view preference
// that's fine to lose.

const KEY = "trace.closedSubagentTabs";
/** Call ids kept per workspace: the newest, so a long-lived chat can't grow it forever. */
const MAX_PER_WORKSPACE = 300;

type Closed = Record<string, string[]>;

function load(): Closed {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (typeof raw !== "object" || raw === null) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        (e): e is [string, string[]] =>
          Array.isArray(e[1]) && e[1].every((id) => typeof id === "string")
      )
    );
  } catch {
    return {};
  }
}

function save(closed: Closed) {
  try {
    localStorage.setItem(KEY, JSON.stringify(closed));
  } catch {
    // A view preference: fine to lose.
  }
}

interface ClosedTabsStore {
  closed: Closed;
  close: (workspaceId: string, callIds: readonly string[]) => void;
  reopen: (workspaceId: string, callId: string) => void;
}

export const useClosedTabs = create<ClosedTabsStore>((set) => ({
  closed: load(),
  close: (workspaceId, callIds) =>
    set((s) => {
      const was = s.closed[workspaceId] ?? [];
      const next = [...new Set([...was, ...callIds])].slice(-MAX_PER_WORKSPACE);
      const closed = { ...s.closed, [workspaceId]: next };
      save(closed);
      return { closed };
    }),
  reopen: (workspaceId, callId) =>
    set((s) => {
      const was = s.closed[workspaceId];
      if (!was?.includes(callId)) return s;
      const closed = { ...s.closed, [workspaceId]: was.filter((id) => id !== callId) };
      save(closed);
      return { closed };
    }),
}));

/** Whether a subagent's tab was closed. */
export function isTabClosed(workspaceId: string, callId: string): boolean {
  return useClosedTabs.getState().closed[workspaceId]?.includes(callId) ?? false;
}

/** Close subagent tabs: a pane showing one shows the tab beside it instead. */
export function closeSubagentTabs(workspaceId: string, callIds: readonly string[]): void {
  if (callIds.length > 0) useClosedTabs.getState().close(workspaceId, callIds);
}

/** Bring a closed subagent tab back (nothing if it's open). */
export function reopenSubagentTab(workspaceId: string, callId: string): void {
  useClosedTabs.getState().reopen(workspaceId, callId);
}

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
