import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "@/app/toast";
import { agentOptions, setAgentOption } from "@/ipc/agentOptions";
import type { OptionKind } from "./agentOptionsFormat";
import type { AgentOptions } from "./types";

// Each workspace's picked model, effort and permission mode, as saved in the
// backend (`agent-options.json`). Read once per workspace; a pick saves it and,
// while the agent runs, the backend sends it on (what the agent then reports
// comes back as SessionInfo).

interface AgentOptionsState {
  saved: Record<string, AgentOptions>;
  load: (workspaceId: string) => void;
  pick: (workspaceId: string, kind: OptionKind, value: string) => void;
}

const asked = new Set<string>();

export const useAgentOptionsStore = create<AgentOptionsState>((set, get) => ({
  saved: {},
  load: (workspaceId) => {
    if (asked.has(workspaceId)) return;
    asked.add(workspaceId);
    void agentOptions(workspaceId)
      .then((options) => set((s) => ({ saved: { ...s.saved, [workspaceId]: options } })))
      .catch(() => asked.delete(workspaceId));
  },
  pick: (workspaceId, kind, value) => {
    const before = get().saved[workspaceId] ?? {};
    const next = { ...before, [kind]: value };
    set((s) => ({ saved: { ...s.saved, [workspaceId]: next } }));
    void setAgentOption(workspaceId, kind, value)
      .then((r) => set((s) => ({ saved: { ...s.saved, [workspaceId]: r.options } })))
      .catch((e) => {
        set((s) => ({ saved: { ...s.saved, [workspaceId]: before } }));
        toast.error(`Couldn't change it: ${String(e)}`);
      });
  },
}));

/** A workspace's saved options, read on first use. */
export function useSavedOptions(workspaceId: string): AgentOptions | undefined {
  const load = useAgentOptionsStore((s) => s.load);
  useEffect(() => load(workspaceId), [load, workspaceId]);
  return useAgentOptionsStore((s) => s.saved[workspaceId]);
}

import.meta.hot?.accept(() => location.reload());
