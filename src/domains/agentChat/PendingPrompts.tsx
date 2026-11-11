import { useMemo } from "react";
import { useBoardStore } from "@/domains/board/store";
import { answerChatPrompt, sendChatMessage } from "@/ipc/agentChat";
import { ApprovalCard } from "./ApprovalCard";
import { type ChatView, ChatViewContext } from "./chatContext";
import { useJournalFeed } from "./hooks/useJournalFeed";
import { QuestionCard } from "./QuestionCard";
import { useAgentChatStore, useJournal } from "./store";
import type { Approval } from "./types";
import { openPrompts } from "./waiting";

// A chat agent's open prompts outside its chat view — the Inbox shows them and
// answers them in place, over the chat protocol rather than keystrokes. Each is
// the chat's own ask card, so the stack around them has no frame of its own.

/** The open prompts of `workspaceId`'s chat agent, answerable here. Nothing when none is open. */
export function ChatPrompts({ workspaceId }: { workspaceId: string }) {
  useJournalFeed(workspaceId);
  const journal = useJournal(workspaceId);
  const prompts = useMemo(() => openPrompts(journal.rows), [journal.rows]);
  const view = useMemo<ChatView>(
    () => ({ workspaceId, root: null, expandAll: false }),
    [workspaceId]
  );
  if (prompts.length === 0) return null;
  return (
    <ChatViewContext.Provider value={view}>
      <section className="ac-prompts" aria-label="What the agent needs">
        {prompts.map((p) =>
          p.kind === "approval" ? (
            <ApprovalCard key={p.approval.requestId} approval={p.approval} />
          ) : (
            <QuestionCard key={p.questions.requestId} questions={p.questions} />
          )
        )}
      </section>
    </ChatViewContext.Provider>
  );
}

function firstApproval(workspaceId: string): Approval | null {
  const rows = useAgentChatStore.getState().journals[workspaceId]?.rows ?? [];
  const first = openPrompts(rows).find((p) => p.kind === "approval");
  return first?.kind === "approval" ? first.approval : null;
}

/** Inbox keys 1–9: pick option `index` of the agent's first open approval. */
export async function pickChatOption(workspaceId: string, index: number): Promise<void> {
  const approval = firstApproval(workspaceId);
  const option = approval?.options[index];
  if (!approval || !option) return;
  useBoardStore.getState().noteUserTurn(workspaceId);
  await answerChatPrompt(workspaceId, approval.requestId, {
    kind: "approval",
    optionId: option.id,
  });
}

/**
 * The Inbox reply to a chat agent: with an approval open, it's a "no, do this
 * instead" (deny, with the text as the reason, as Esc then typing is for a
 * terminal); otherwise a new message.
 */
export async function replyToChat(workspaceId: string, text: string): Promise<void> {
  const message = text.trim();
  if (!message) return;
  useBoardStore.getState().noteUserTurn(workspaceId);
  const approval = firstApproval(workspaceId);
  const deny = approval?.options.find((o) => o.kind === "deny");
  if (approval && deny) {
    await answerChatPrompt(workspaceId, approval.requestId, {
      kind: "approval",
      optionId: deny.id,
      note: message,
    });
    return;
  }
  await sendChatMessage(workspaceId, { text: message, attachments: [] });
}
