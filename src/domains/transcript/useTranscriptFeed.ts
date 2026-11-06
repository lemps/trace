import { useEffect } from "react";
import { useBoardStore } from "@/domains/board/store";
import { onAgentTurn } from "@/ipc/events";
import { type Feed, useTranscriptStore } from "./store";

/** How often a running agent's transcript is re-read while it's on screen. */
const POLL_MS = 1200;

const EMPTY: Feed = { sessionId: null, offset: 0, items: [], loaded: false };

/**
 * Keep a workspace's transcript current while it's shown: read on mount, poll
 * while the agent runs (Claude appends to the file as the turn goes; each read
 * only parses what's new), and read at once when a turn ends.
 */
export function useTranscriptFeed(workspaceId: string): Feed {
  const running = useBoardStore((s) => s.runningAgents.has(workspaceId));
  const refresh = useTranscriptStore((s) => s.refresh);

  useEffect(() => {
    void refresh(workspaceId);
    if (!running) return;
    const timer = setInterval(() => void refresh(workspaceId), POLL_MS);
    return () => clearInterval(timer);
  }, [workspaceId, running, refresh]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onAgentTurn((turn) => {
      if (turn.workspaceId === workspaceId) void refresh(workspaceId);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [workspaceId, refresh]);

  return useTranscriptStore((s) => s.feeds[workspaceId] ?? EMPTY);
}
