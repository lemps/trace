import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Answer,
  ChatAgentState,
  JournalEvent,
  JournalRow,
  SessionInfoEvent,
  Transport,
  UserMessage,
} from "@/domains/agentChat/types";

// Typed wrappers around `commands/agent_chat.rs`: chat agents, which run headless
// over a structured protocol and report as journal rows. See docs/AGENT_CHAT.md.

/**
 * A workspace's chat agent as it is now: its transport, whether one runs, and
 * what it last reported. Read on mount, since events only tell what changes.
 * Chat agents start, stop and resume through the same commands as terminal ones
 * (`startAgent`, `startSession`, `stopAgent` in ipc/agent.ts and ipc/session.ts).
 */
export function chatAgentState(workspaceId: string): Promise<ChatAgentState> {
  return invoke("chat_agent_state", { workspaceId });
}

/** The CLIs that can run as a chat agent; the rest run in a terminal. */
export function chatAgentBrands(): Promise<string[]> {
  return invoke("chat_agent_brands");
}

/** Choose a workspace's transport before its agent first starts. */
export function setWorkspaceTransport(workspaceId: string, transport: Transport): Promise<void> {
  return invoke("set_agent_transport", { workspaceId, transport });
}

/** A user turn. Sent during a turn, Claude queues it. */
export function sendChatMessage(workspaceId: string, message: UserMessage): Promise<void> {
  return invoke("send_chat_message", { workspaceId, message });
}

/** Resolve an approval or question row by its `requestId`. */
export function answerChatPrompt(
  workspaceId: string,
  requestId: string,
  answer: Answer
): Promise<void> {
  return invoke("answer_chat_prompt", { workspaceId, requestId, answer });
}

/** Stop the running turn and every subagent (background ones too); the agent stays up. */
export function interruptChatAgent(workspaceId: string): Promise<void> {
  return invoke("interrupt_chat_agent", { workspaceId });
}

/** Stop one subagent, named by the call that started it; the turn goes on. */
export function stopChatSubagent(workspaceId: string, callId: string): Promise<void> {
  return invoke("stop_chat_subagent", { workspaceId, callId });
}

/**
 * The workspace's journal, each row at its latest revision, in `seq` order. While
 * no agent runs, rows it left open (a prompt, a running tool) read as ended.
 */
export function loadJournal(workspaceId: string): Promise<JournalRow[]> {
  return invoke("load_journal", { workspaceId });
}

/** New rows and new revisions of rows, as the agent produces them. */
export function onAgentJournal(cb: (payload: JournalEvent) => void): Promise<UnlistenFn> {
  return listen<JournalEvent>("agent-journal", (e) => cb(e.payload));
}

/** The agent's model, conversation id, slash commands, limits and busy state. */
export function onAgentSessionInfo(cb: (payload: SessionInfoEvent) => void): Promise<UnlistenFn> {
  return listen<SessionInfoEvent>("agent-session-info", (e) => cb(e.payload));
}
