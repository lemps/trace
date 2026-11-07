import { type KeyboardEvent, useState } from "react";
import { toast } from "@/app/toast";
import { replyToChat } from "@/domains/agentChat/PendingPrompts";
import { reply, TERMINAL_ONLY } from "@/domains/live/answer";
import type { AskKind } from "@/domains/live/types";
import { isSendAndNext, useHint } from "@/platform/shortcuts";

interface ReplyBoxProps {
  workspaceId: string;
  /** What's pending — a permission/plan menu is dismissed before the message goes. */
  pendingKind: AskKind | null;
  /** A chat agent: the reply is a chat message (or the reason for denying its open approval). */
  chat: boolean;
  /** ⌘⏎: send, then move to the next agent that needs you. */
  onSentNext: () => void;
}

// Talk to the agent without opening its terminal. ⏎ sends; ⌘⏎ sends and moves on.
export function ReplyBox({ workspaceId, pendingKind, chat, onSentNext }: ReplyBoxProps) {
  const [text, setText] = useState("");
  const sendHint = useHint("inboxSend");
  const nextHint = useHint("sendAndNext");
  const send = (thenNext: boolean) => {
    if (!text.trim()) return;
    const message = text;
    setText("");
    (chat ? replyToChat(workspaceId, message) : reply(workspaceId, message, pendingKind))
      .then(() => {
        if (thenNext) onSentNext();
      })
      .catch((err) => {
        setText(message);
        toast.error(`Couldn't send: ${err}`);
      });
  };
  if (pendingKind && TERMINAL_ONLY.has(pendingKind)) {
    return (
      <div className="ib-reply ib-reply-off">
        It's asking a question — pick an answer above
        {chat ? ", or type one in its box." : ", or open it to type your own."}
      </div>
    );
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const thenNext = isSendAndNext(e);
    if (!thenNext && e.key !== "Enter") return;
    e.preventDefault();
    send(thenNext);
  };
  return (
    <label className="ib-reply">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={
          pendingKind === "permission"
            ? "Or tell the agent what to do instead…"
            : "Reply without opening the terminal…"
        }
        aria-label="Reply to the agent"
        title={`Send (${sendHint}) · send and go to the next agent (${nextHint})`}
      />
    </label>
  );
}
