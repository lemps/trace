import { runIdOf } from "@/domains/schedules/ids";
import { useSchedulesStore } from "@/domains/schedules/store";
import { useSessionsStore } from "@/domains/sessions/store";
import type { CreatedBy, ScratchSession } from "@/domains/sessions/types";
import { listSessions } from "@/ipc/session";

/**
 * Who a session started over MCP was started by, from the calling agent's
 * workspace id. That id is what the tool server read from the agent's own
 * `X-Trace-Workspace` header (set by trace when it spawned the agent), never a
 * name the agent passed in, and the label is looked up here from trace's own
 * state: a session's title (a companion agent counts as its session), a
 * scheduled run's prompt, or else the ticket's key. A session the renderer
 * hasn't seen yet is looked up on disk before the caller is taken for a ticket.
 */
export async function creatorFromCaller(caller: string): Promise<CreatedBy | undefined> {
  if (!caller) return undefined;
  const runId = runIdOf(caller);
  if (runId) {
    const { runs, prompts } = useSchedulesStore.getState();
    const promptId = runs.find((r) => r.id === runId)?.promptId;
    const prompt = prompts.find((p) => p.id === promptId);
    return prompt
      ? { kind: "schedule", promptId: prompt.id, runId, label: prompt.title }
      : undefined;
  }
  const owns = (s: ScratchSession) => s.id === caller || s.agents?.some((a) => a.id === caller);
  const owner =
    useSessionsStore.getState().sessions.find(owns) ??
    (await listSessions().catch(() => [])).find(owns);
  if (owner) {
    return { kind: "agent", workspaceId: owner.id, parent: "session", label: owner.title };
  }
  return { kind: "agent", workspaceId: caller, parent: "ticket", label: caller };
}
