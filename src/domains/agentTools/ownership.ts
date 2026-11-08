import type { CreatedBy, ScratchSession } from "@/domains/sessions/types";
import { runIdOf } from "../schedules/ids.ts";

// Which sessions an agent may stop or interrupt: the ones it started, and theirs
// in turn, judged by each session's recorded `createdBy` (written by trace from
// the starting agent's own `X-Trace-Workspace` header, never from a tool
// argument). Pure (relative `.ts` imports) so `npm test` can load it.

/** Longest creator chain walked; deeper (or a loop) counts as not started by the caller. */
const MAX_DEPTH = 32;

/** What a calling workspace id stands for, the way `createdBy` records it. */
export type CallerRef =
  | { kind: "session"; id: string }
  | { kind: "ticket"; id: string }
  | { kind: "schedule"; runId: string };

/** The calling agent as `createdBy` names it: its session (a companion counts as its session), its run, or its ticket. */
export function callerRef(caller: string, sessions: ScratchSession[]): CallerRef | null {
  if (!caller) return null;
  const runId = runIdOf(caller);
  if (runId) return { kind: "schedule", runId };
  const owner = sessions.find((s) => s.id === caller || s.agents?.some((a) => a.id === caller));
  return owner ? { kind: "session", id: owner.id } : { kind: "ticket", id: caller };
}

/** Whether `cb` names `ref` as the creator. */
function names(cb: CreatedBy | null | undefined, ref: CallerRef): boolean {
  if (!cb) return false;
  if (cb.kind === "agent") {
    if (ref.kind === "session") return cb.parent === "session" && cb.workspaceId === ref.id;
    if (ref.kind === "ticket") return cb.parent === "ticket" && cb.workspaceId === ref.id;
    return false;
  }
  return cb.kind === "schedule" && ref.kind === "schedule" && cb.runId === ref.runId;
}

/**
 * Whether the agent `caller` started `target`, directly or through sessions it
 * started. A session never counts as its own descendant, and anything the user,
 * the orchestrator or another agent started is not the caller's.
 */
export function startedByCaller(
  target: ScratchSession,
  caller: string,
  sessions: ScratchSession[]
): boolean {
  const ref = callerRef(caller, sessions);
  if (!ref) return false;
  if (ref.kind === "session" && ref.id === target.id) return false;
  const seen = new Set<string>();
  let current: ScratchSession | undefined = target;
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    const cb: CreatedBy | null | undefined = current.createdBy;
    if (names(cb, ref)) return true;
    // Up one level: only a session parent has a record of its own to follow.
    if (cb?.kind !== "agent" || cb.parent !== "session") return false;
    const parentId: string = cb.workspaceId;
    current = sessions.find((s) => s.id === parentId);
  }
  return false;
}

/** The refusal an agent gets for a session it didn't start. */
export function notYours(title: string, action: "stop" | "interrupt"): string {
  return `Refused: "${title}" wasn't started by you (or by a session you started), so you can't ${action} it. The user can ${action} it from trace.`;
}
