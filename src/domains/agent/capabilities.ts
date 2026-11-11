import { useEffect } from "react";
import { create } from "zustand";
import { type AgentCapabilities, agentCapabilities } from "@/ipc/agent";

// What each agent's host can do besides its screen. A Vercel sandbox runs the
// terminal or the chat, but its conversation log and folder stay in the sandbox,
// so the transcript view and the folder tabs hide for it. A session's host
// never changes, so each is asked once; a ticket's can, so it's asked again after a start.

interface CapabilitiesStore {
  byWorkspace: Record<string, AgentCapabilities>;
  load: (workspaceId: string) => Promise<void>;
  /** Ask again: a ticket's host changes when it's started somewhere else. */
  reload: (workspaceId: string) => Promise<void>;
}

const asked = new Set<string>();

export const useCapabilitiesStore = create<CapabilitiesStore>((set, get) => ({
  byWorkspace: {},
  async reload(workspaceId) {
    asked.delete(workspaceId);
    await get().load(workspaceId);
  },
  async load(workspaceId) {
    if (asked.has(workspaceId)) return;
    asked.add(workspaceId);
    try {
      const caps = await agentCapabilities(workspaceId);
      set((s) => ({ byWorkspace: { ...s.byWorkspace, [workspaceId]: caps } }));
    } catch {
      // Unknown reads as this computer (everything), the common case.
      asked.delete(workspaceId);
    }
  },
}));

/** The host's capabilities for `workspaceId`; null until known, which callers
 * treat as this computer. */
export function useCapabilities(workspaceId: string): AgentCapabilities | null {
  const caps = useCapabilitiesStore((s) => s.byWorkspace[workspaceId] ?? null);
  const load = useCapabilitiesStore((s) => s.load);
  useEffect(() => {
    void load(workspaceId);
  }, [workspaceId, load]);
  return caps;
}

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
