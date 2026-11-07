import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/app/toast";
import { fitTerminal, resetTerminal, syncPtySize } from "@/domains/agent/terminalRegistry";
import { syncChatActivity } from "@/domains/agentChat/liveBridge";
import { stopAndWait } from "@/domains/agentChat/switch";
import { noteTransport, resolveTransport } from "@/domains/agentChat/transport";
import { adoptIfAlive } from "@/domains/board/adopt";
import { useBoardStore } from "@/domains/board/store";
import { type AgentCli, resetAgentSession, stopAgent, type Transport } from "@/ipc/agent";

/** Start/stop lifecycle for one agent, keyed by its workspace id. */
export interface AgentRun {
  running: boolean;
  error: string | null;
  /** Start it: on `transport` if given, else on what it ran on last (or the default). */
  start: (transport?: Transport) => Promise<void>;
  stop: () => Promise<void>;
  /** Stop it, wait for it to go, and start it again: on `transport` if given. */
  restart: (transport?: Transport) => Promise<void>;
  /** Forget the saved conversation, then start — recovers a stale session id. */
  startFresh: () => Promise<void>;
}

/**
 * Drives one agent, in a PTY or as a chat: the session's own agent or any
 * companion sharing its worktree. Every agent is addressed by a workspace id,
 * so this hook needs nothing but that id, its CLI, and how to spawn it — which
 * is the only thing that differs between the two (`start_session` vs
 * `start_session_agent`).
 *
 * `spawn` is called with the live terminal's measured size, so the PTY is created
 * at the right geometry and there's no spawn-time resize to double-paint the TUI's
 * banner (see PtyTerminal).
 */
export function useAgentRun(
  workspaceId: string,
  cli: AgentCli,
  spawn: (cols: number, rows: number, transport: Transport) => Promise<void>
): AgentRun {
  const [error, setError] = useState<string | null>(null);
  const running = useBoardStore((s) => s.runningAgents.has(workspaceId));
  const setAgentRunning = useBoardStore((s) => s.setAgentRunning);
  const clearOutput = useBoardStore((s) => s.clearOutput);
  const startingRef = useRef(false);

  // Reconcile run-state with the backend when the id changes. Startup adoption has
  // usually done this, but this view can mount first — and a live agent would wrongly
  // show the "Start" overlay, where clicking Start would no-op backend-side *after*
  // the frontend cleared the terminal, leaving a blank screen (an idle agent emits
  // nothing to repaint it). Adopt the backend's truth.
  useEffect(() => {
    let cancelled = false;
    void adoptIfAlive(workspaceId).then((adopted) => {
      // The pane may have resized while the spawn was in flight.
      if (adopted && !cancelled) syncPtySize(workspaceId);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const launch = useCallback(
    async (chosen?: Transport) => {
      const transport = await resolveTransport(workspaceId, cli, chosen);
      // The terminal is already mounted under the start overlay, so spawn at its
      // measured size.
      const size = fitTerminal(workspaceId) ?? { cols: 80, rows: 24 };
      if (transport === "terminal") {
        clearOutput(workspaceId);
        resetTerminal(workspaceId);
      }
      await spawn(size.cols, size.rows, transport);
      noteTransport(workspaceId, transport);
      setAgentRunning(workspaceId, true);
      if (transport === "chat") syncChatActivity(workspaceId);
    },
    [workspaceId, cli, spawn, clearOutput, setAgentRunning]
  );

  // A re-entrant start would spawn a second agent into the same workspace and
  // duplicate the terminal output.
  const guarded = useCallback(async (work: () => Promise<void>) => {
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(String(err));
      toast.error(String(err));
    } finally {
      startingRef.current = false;
    }
  }, []);

  const start = useCallback(
    async (transport?: Transport) => {
      if (useBoardStore.getState().runningAgents.has(workspaceId)) return;
      await guarded(() => launch(transport));
    },
    [workspaceId, guarded, launch]
  );

  const restart = useCallback(
    (transport?: Transport) =>
      guarded(async () => {
        await stopAndWait(workspaceId);
        await launch(transport);
      }),
    [workspaceId, guarded, launch]
  );

  const stop = useCallback(async () => {
    // A chat agent takes a moment to exit; Start must not race it.
    await stopAndWait(workspaceId).catch(() => stopAgent(workspaceId).catch(() => {}));
    setAgentRunning(workspaceId, false);
    clearOutput(workspaceId);
  }, [workspaceId, setAgentRunning, clearOutput]);

  const startFresh = useCallback(async () => {
    await resetAgentSession(workspaceId).catch(() => {});
    await start();
  }, [workspaceId, start]);

  return { running, error, start, stop, restart, startFresh };
}
