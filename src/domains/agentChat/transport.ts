import { useEffect } from "react";
import { ensureChatListeners } from "./hooks/useJournalFeed";
import { useAgentChatStore } from "./store";

/**
 * Whether a workspace's agent runs on the chat transport, so its views mount
 * `ChatAgentPane` instead of the terminal. For now: once the backend has
 * reported a chat agent for it. The per-agent transport setting (Settings →
 * Agents, the New session dialog) replaces this later; see docs/AGENT_CHAT.md.
 */
export function useIsChatAgent(workspaceId: string): boolean {
  useEffect(ensureChatListeners, []);
  return useAgentChatStore((s) => s.info[workspaceId] !== undefined);
}
