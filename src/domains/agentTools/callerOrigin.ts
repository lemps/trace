import { runIdOf } from "@/domains/schedules/ids";
import { useSchedulesStore } from "@/domains/schedules/store";
import { useSessionsStore } from "@/domains/sessions/store";
import type { CreatedBy } from "@/domains/sessions/types";

/**
 * Who a session started over MCP was started by, from the calling agent's
 * workspace id. That id is what the tool server read from the agent's own
 * `X-Trace-Workspace` header (set by trace when it spawned the agent), never a
 * name the agent passed in, and the label is looked up here from trace's own
 * state: a session's title (a companion agent counts as its session), a
 * scheduled run's prompt, or else the ticket's key.
 */
export function creatorFromCaller(caller: string): CreatedBy | undefined {
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
  const owner = useSessionsStore
    .getState()
    .sessions.find((s) => s.id === caller || s.agents?.some((a) => a.id === caller));
  if (owner) {
    return { kind: "agent", workspaceId: owner.id, parent: "session", label: owner.title };
  }
  return { kind: "agent", workspaceId: caller, parent: "ticket", label: caller };
}
