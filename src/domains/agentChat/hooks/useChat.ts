import { buildChat, type Chat } from "../projection";
import { useAgentChatStore, useJournal } from "../store";
import type { JournalRow } from "../types";
import { isAgentWorking } from "../working";

// A workspace's journal arranged for reading (`projection.ts`), built once per
// journal change however many views read it: the chat pane, its subagents' tabs
// and their marks, and anything else that lists or shows a workspace's subagents.

const built = new WeakMap<readonly JournalRow[], Chat>();

/** The projection of `rows`, shared by everyone holding the same array. */
export function chatOf(rows: readonly JournalRow[]): Chat {
  let chat = built.get(rows);
  if (!chat) {
    chat = buildChat(rows);
    built.set(rows, chat);
  }
  return chat;
}

export function useChat(workspaceId: string): Chat {
  return chatOf(useJournal(workspaceId).rows);
}

/** The agent is at work: a turn running, or subagents still going after it (`working.ts`). */
export function useAgentWorking(workspaceId: string): boolean {
  const info = useAgentChatStore((s) => s.info[workspaceId]);
  return isAgentWorking(info, useChat(workspaceId));
}
