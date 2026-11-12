import { agentArgs } from "@/domains/agent/defaults";
import { syncChatActivity } from "@/domains/agentChat/liveBridge";
import { noteTransport, resolveTransport } from "@/domains/agentChat/transport";
import { useBoardStore } from "@/domains/board/store";
import { startSession } from "@/ipc/session";
import type { ScratchSession } from "./types";

// Starting a session's agent from outside its detail view: the New session dialog
// (which starts it on the task you typed) and an agent's own `start_session` tool.
// A mounted pane uses `useSessionAgentRun` instead, which spawns at the terminal's
// measured size; `start_session` is idempotent, so whichever runs second finds it
// already up.

/** The size to start at when no terminal has been measured yet. */
const COLS = 120;
const ROWS = 40;

/** Start (or resume) a session's agent, on its transport, with `prompt` as its first message. */
export async function launchSession(session: ScratchSession, prompt?: string): Promise<void> {
  // Remote Control is a TUI feature, so a session started with it is a terminal.
  const transport = session.remoteControl
    ? "terminal"
    : await resolveTransport(session.id, session.cli);
  await startSession(session.id, COLS, ROWS, agentArgs(), prompt || undefined, transport);
  noteTransport(session.id, transport);
  const board = useBoardStore.getState();
  board.setAgentRunning(session.id, true);
  // A prompt is the user handing it work, so its finished turn is worth a notification.
  if (prompt) board.noteUserTurn(session.id);
  else if (transport === "chat") syncChatActivity(session.id);
}
