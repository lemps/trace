import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Answer,
  JournalEvent,
  JournalRow,
  SessionInfoEvent,
  UserMessage,
} from "@/domains/agentChat/types";

// Typed wrappers around `commands/agent_chat.rs`: chat agents, which run headless
// over a structured protocol and report as journal rows. See docs/AGENT_CHAT.md.

export interface StartChatAgentArgs {
  workspaceId: string;
  model?: string;
  /** A registered model provider ("moonshot", "wafer", …); Anthropic when unset. */
  provider?: string;
  /** Flags from Settings → Agents, as for a terminal agent. */
  extraArgs?: string[];
  /** An issue's summary + labels, for repo mappings. */
  matchText?: string;
}

/**
 * Start a chat agent: in its issue's worktree, or where its session runs. Resumes
 * the workspace's saved conversation. A no-op while one runs; fails while the
 * workspace's terminal agent runs, since they'd share the conversation.
 */
export function startChatAgent(args: StartChatAgentArgs): Promise<void> {
  return invoke("start_chat_agent", { ...args });
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

/** Stop the running turn; the agent stays up. */
export function interruptChatAgent(workspaceId: string): Promise<void> {
  return invoke("interrupt_chat_agent", { workspaceId });
}

/** End the agent. A no-op if none runs. */
export function stopChatAgent(workspaceId: string): Promise<void> {
  return invoke("stop_chat_agent", { workspaceId });
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
