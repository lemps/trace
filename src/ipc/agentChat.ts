import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Answer,
  JournalEvent,
  JournalRow,
  SessionInfoEvent,
  UserMessage,
} from "@/domains/agentChat/types";

// Typed wrappers for the chat transport (`agent_session`, docs/AGENT_CHAT.md).
// A stub written against the doc's command names so the chat UI and the
// backend can land in either order; the backend's own version replaces it.

/** Start (or resume) the workspace's chat agent. */
export function startChatAgent(workspaceId: string): Promise<void> {
  return invoke("start_chat_agent", { workspaceId });
}

/** A user turn. The UI queues messages typed while a turn runs and sends them after. */
export function sendChatMessage(workspaceId: string, message: UserMessage): Promise<void> {
  return invoke("send_chat_message", { workspaceId, message });
}

/** Resolve an approval or question by its `requestId`. */
export function answerChatPrompt(
  workspaceId: string,
  requestId: string,
  answer: Answer
): Promise<void> {
  return invoke("answer_chat_prompt", { workspaceId, requestId, answer });
}

/** Stop the current turn and keep the agent. */
export function interruptChatAgent(workspaceId: string): Promise<void> {
  return invoke("interrupt_chat_agent", { workspaceId });
}

/** End the agent. */
export function stopChatAgent(workspaceId: string): Promise<void> {
  return invoke("stop_chat_agent", { workspaceId });
}

/** The saved journal: each row id at its highest revision. */
export function loadJournal(workspaceId: string): Promise<JournalRow[]> {
  return invoke("load_journal", { workspaceId });
}

/** New or changed rows, as the agent produces them. */
export function onAgentJournal(cb: (payload: JournalEvent) => void): Promise<UnlistenFn> {
  return listen<JournalEvent>("agent-journal", (e) => cb(e.payload));
}

/** The agent's model, slash commands, busy flag and usage limits changed. */
export function onAgentSessionInfo(cb: (payload: SessionInfoEvent) => void): Promise<UnlistenFn> {
  return listen<SessionInfoEvent>("agent-session-info", (e) => cb(e.payload));
}
