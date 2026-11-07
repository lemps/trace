import type Anthropic from "@anthropic-ai/sdk";
import { activity } from "@/domains/activity/store";
import { runsAsChat } from "@/domains/agentChat/deliver";
import { stopAndWait } from "@/domains/agentChat/switch";
import { useBoardStore } from "@/domains/board/store";
import { useSessionsStore } from "@/domains/sessions/store";
import type { ScratchSession } from "@/domains/sessions/types";
import { sendAgentInput, stopAgent } from "@/ipc/agent";
import { interruptChatAgent } from "@/ipc/agentChat";
import { need } from "./args";
import { notYours, startedByCaller } from "./ownership";
import { findSession } from "./sessionTools";

// Stopping or interrupting a session an agent started (or one started by a
// session it started), through the same calls the UI's Interrupt and Stop make.
// Anything else is refused: the user's sessions, other agents' and the
// orchestrator's are the user's to stop.

const SESSION_REF = {
  type: "string",
  description: "The session's id (from start_session or list_sessions), or its exact title.",
};

export const CONTROL_TOOLS: Anthropic.Tool[] = [
  {
    name: "interrupt_session",
    description:
      "Interrupt what a session's agent is doing now: its current turn and any subagents it's running, as the user's Esc or Interrupt does. The agent stays up and waits at its prompt, so send_to_session can redirect it. Only for sessions you started with start_session, or ones those sessions started; anything else is refused. Returns what was interrupted.",
    input_schema: {
      type: "object",
      properties: { session_id: SESSION_REF },
      required: ["session_id"],
    },
  },
  {
    name: "stop_session",
    description:
      "Stop a session's agent (and any companion agents in it): its process ends, its conversation and worktree are kept, and send_to_session starts it again. Only for sessions you started with start_session, or ones those sessions started; anything else is refused. Returns what was stopped.",
    input_schema: {
      type: "object",
      properties: { session_id: SESSION_REF },
      required: ["session_id"],
    },
  },
];

const NAMES = new Set(CONTROL_TOOLS.map((t) => t.name));

export function isControlTool(name: string): boolean {
  return NAMES.has(name);
}

/** The session's agents that are running: its own and its companions'. */
function runningAgents(session: ScratchSession): string[] {
  const running = useBoardStore.getState().runningAgents;
  return [session.id, ...(session.agents ?? []).map((a) => a.id)].filter((id) => running.has(id));
}

async function interrupt(id: string): Promise<void> {
  // A chat agent's Interrupt (it stops subagents too); a terminal's is the Esc key.
  if (await runsAsChat(id)) await interruptChatAgent(id);
  else await sendAgentInput(id, "\x1b");
}

async function stop(id: string): Promise<void> {
  // What the session's Stop does (`useAgentRun`).
  await stopAndWait(id).catch(() => stopAgent(id).catch(() => {}));
  const board = useBoardStore.getState();
  board.setAgentRunning(id, false);
  board.clearOutput(id);
}

/** Run interrupt_session / stop_session for the agent `caller`. Throws on refusal. */
export async function runControlTool(
  name: string,
  input: unknown,
  caller: string
): Promise<string> {
  const action = name === "stop_session" ? "stop" : "interrupt";
  const session = findSession(need(input, "session_id"));
  const all = useSessionsStore.getState().sessions;
  if (!startedByCaller(session, caller, all)) throw new Error(notYours(session.title, action));
  const ids = runningAgents(session);
  if (ids.length === 0) return `"${session.title}" isn't running; nothing to ${action}.`;
  for (const id of ids) await (action === "stop" ? stop(id) : interrupt(id));
  activity.log({
    kind: action === "stop" ? "agent-stopped" : "agent-interrupted",
    actor: "agent",
    workspaceId: session.id,
    subject: session.title,
    title: action === "stop" ? `stopped “${session.title}”` : `interrupted “${session.title}”`,
    data: { by: caller, agents: ids.length },
  });
  const n = ids.length === 1 ? "its agent" : `its ${ids.length} agents`;
  return action === "stop"
    ? `Stopped "${session.title}" (${n}). send_to_session starts it again.`
    : `Interrupted "${session.title}" (${n}). It's waiting at its prompt.`;
}
