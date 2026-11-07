import { useMemo } from "react";
import { useActivityStore } from "@/domains/activity/store";
import type { ActivityEvent } from "@/domains/activity/types";
import { agentWorkspaceIds } from "../agentRoster";
import type { ScratchSession } from "../types";

/** Epoch ms of each session's newest activity event (any of its agents'), by id. */
export function lastActiveBySession(
  sessions: readonly ScratchSession[],
  events: readonly ActivityEvent[]
): Record<string, number> {
  const owner = new Map<string, string>();
  for (const s of sessions) for (const id of agentWorkspaceIds(s)) owner.set(id, s.id);
  const out: Record<string, number> = {};
  for (const e of events) {
    const id = e.workspaceId ? owner.get(e.workspaceId) : undefined;
    if (id && e.at > (out[id] ?? 0)) out[id] = e.at;
  }
  return out;
}

/** `lastActiveBySession` over the live activity log, for the "Last active" sort. */
export function useLastActive(sessions: readonly ScratchSession[]): Record<string, number> {
  const events = useActivityStore((s) => s.events);
  return useMemo(() => lastActiveBySession(sessions, events), [sessions, events]);
}
