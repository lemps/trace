import { useCallback } from "react";
import { agentArgs } from "@/domains/agent/defaults";
import type { Transport } from "@/ipc/agent";
import { startSession, startSessionAgent } from "@/ipc/session";
import type { RosterEntry } from "../agentRoster";
import type { ScratchSession } from "../types";
import { type AgentRun, useAgentRun } from "./useAgentRun";

/**
 * One of a session's agents, driven: the session's own agent spawns through
 * `start_session`, a companion through `start_session_agent` — the only difference.
 * The header and the agent's pane each hold one; `useAgentRun` keeps them from
 * starting it twice.
 */
export function useSessionAgentRun(session: ScratchSession, entry: RosterEntry): AgentRun {
  const spawn = useCallback(
    (cols: number, rows: number, transport: Transport) =>
      entry.companion
        ? startSessionAgent(session.id, entry.workspaceId, cols, rows, agentArgs(), transport)
        : startSession(session.id, cols, rows, agentArgs(), undefined, transport),
    [session.id, entry.companion, entry.workspaceId]
  );
  return useAgentRun(entry.workspaceId, entry.cli, spawn);
}

/** What the start overlay says about where this agent will work. */
export function startHint(session: ScratchSession, entry: RosterEntry): string {
  if (session.folder)
    return "The agent runs directly in this session's folder, with no git worktree.";
  if (entry.companion) {
    return "Runs in this session's worktree — it sees everything the other agents here have written.";
  }
  return session.worktree
    ? "The agent runs in an isolated worktree for this session."
    : "The agent runs in your repo root and shares your working tree.";
}
