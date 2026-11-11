import { type KeyboardEvent, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { SplitButton } from "@/components/SplitButton";
import { replyToChat } from "@/domains/agentChat/PendingPrompts";
import { reply, TERMINAL_ONLY } from "@/domains/live/answer";
import type { AskKind } from "@/domains/live/types";
import { isSendAndNext, isShortcut, useHint } from "@/platform/shortcuts";

interface ReplyBoxProps {
  workspaceId: string;
  /** What's pending — a permission/plan menu is dismissed before the message goes. */
  pendingKind: AskKind | null;
  /** A chat agent: the reply is a chat message (or the reason for denying its open approval). */
  chat: boolean;
  /** Send and Next: send, then move to the next agent that needs you. */
  onSentNext: () => void;
}

// Talk to the agent without opening its terminal. Send is an icon in the box (its
// key in its tooltip), and its caret also offers "Send and go to next", so both
// have a visible path as well as their keys. Not a primary: the screen's is the
// answer in the card above, or Open.
export function ReplyBox({ workspaceId, pendingKind, chat, onSentNext }: ReplyBoxProps) {
  const [text, setText] = useState("");
  const sendHint = useHint("inboxSend");
  const nextHint = useHint("sendAndNext");
  const empty = !text.trim();
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
    // A chat agent's question card, just above, has its own field for a typed answer:
    // a note pointing at it says nothing new.
    if (chat) return null;
    return (
      <div className="ib-reply ib-reply-off">
        It's asking a question. Pick an answer above, or open it to type your own.
      </div>
    );
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const thenNext = isSendAndNext(e);
    if (!thenNext && !isShortcut("inboxSend", e)) return;
    e.preventDefault();
    send(thenNext);
  };
  return (
    <div className="ib-reply">
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
      />
      <SplitButton
        size="sm"
        up
        menuLabel="More ways to send"
        disabled={empty}
        sections={[
          {
            items: [
              { label: "Send", hint: sendHint, onSelect: () => send(false) },
              { label: "Send and go to next", hint: nextHint, onSelect: () => send(true) },
            ],
          },
        ]}
      >
        <IconButton
          size="sm"
          label="Send"
          shortcut="inboxSend"
          disabled={empty}
          onClick={() => send(false)}
        >
          <I.Send size={14} />
        </IconButton>
      </SplitButton>
    </div>
  );
}
