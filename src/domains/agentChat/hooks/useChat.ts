import { useMemo } from "react";
import { buildChat, type Chat } from "../projection";
import { useAgentChatStore, useJournal } from "../store";
import type { SubagentStatus } from "../subagents";
import type { JournalRow } from "../types";
import { isAgentWorking } from "../working";

// A workspace's journal arranged for reading (`projection.ts`), built once per
// journal change however many views read it: the chat pane, its subagent tabs,
// and anything else that lists or shows a workspace's subagents.

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

/** One subagent, as a list of tabs or panes needs it. */
export interface SubagentSummary {
  /** The call that started it: what `SubagentView` takes. */
  callId: string;
  /** "Explore: find the auth code". */
  label: string;
  status: SubagentStatus;
  toolCount: number;
  /** One of its calls waits on a permission answer. */
  pending: boolean;
}

/**
 * The subagents a workspace's chat agent has started, in order. For the chat
 * pane's tab strip, and for layouts that put a subagent beside the main chat
 * (`<SubagentView workspaceId callId />`). Load the journal with
 * `useJournalFeed` (the chat pane does) for this to fill in.
 */
export function useSubagents(workspaceId: string): SubagentSummary[] {
  const { subagents } = useChat(workspaceId);
  return useMemo(
    () =>
      subagents.map((s) => ({
        callId: s.callId,
        label: s.label,
        status: s.status,
        toolCount: s.toolCount,
        pending: s.pending,
      })),
    [subagents]
  );
}

/** The agent is at work: a turn running, or subagents still going after it (`working.ts`). */
export function useAgentWorking(workspaceId: string): boolean {
  const info = useAgentChatStore((s) => s.info[workspaceId]);
  return isAgentWorking(info, useChat(workspaceId));
}
