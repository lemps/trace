import { useEffect } from "react";
import { create } from "zustand";
import { type AgentCapabilities, agentCapabilities } from "@/ipc/agent";

// What each agent's host can do besides its screen. A Vercel sandbox has the
// terminal only, so the chat move, the transcript view and the folder tabs hide
// for it. A workspace's host never changes, so each is asked once.

interface CapabilitiesStore {
  byWorkspace: Record<string, AgentCapabilities>;
  load: (workspaceId: string) => Promise<void>;
}

const asked = new Set<string>();

export const useCapabilitiesStore = create<CapabilitiesStore>((set) => ({
  byWorkspace: {},
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
