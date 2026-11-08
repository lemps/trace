import { I } from "@/components/Icon";
import { CopyButton } from "@/components/markdown/CodeBlock";
import { PromptBubble } from "@/domains/transcript/PromptBubble";
import { ChatMarkdown } from "./ChatMarkdown";
import { useDisclosure } from "./hooks/useDisclosure";
import type { Message } from "./types";

// Words in the conversation: yours as a bubble on the right, the agent's as
// prose (both Markdown), a system note as a quiet centred line, and its
// reasoning as a folded "Thinking" row. Yours and its replies have a Copy
// under them (the Markdown source), quiet until hovered or reached by Tab.

export function MessageRow({ message }: { message: Message }) {
  switch (message.role) {
    case "user":
      return (
        <div className="ac-msg mine">
          <PromptBubble attachments={message.attachments}>
            <ChatMarkdown text={message.text} />
          </PromptBubble>
          <MessageActions text={message.text} />
        </div>
      );
    case "assistant":
      return (
        <div className="ac-msg">
          <div className={`ac-reply${message.streaming ? " streaming" : ""}`}>
            <ChatMarkdown text={message.text} />
          </div>
          {/* The row is there while it streams too, so finishing doesn't shift the chat. */}
          <MessageActions text={message.streaming ? null : message.text} />
        </div>
      );
    case "system":
      return <div className="tx-notice">{message.text}</div>;
    case "reasoning":
      return <ReasoningRow message={message} />;
  }
}

/** A message's actions: copy its Markdown. `null` while it's still being written. */
function MessageActions({ text }: { text: string | null }) {
  return (
    <div className="ac-msg-actions">
      {text && <CopyButton text={text} label="Copy message" className="ac-msg-copy" />}
    </div>
  );
}

/** The agent's thinking: one line, unfolding to the text. Live thinking shows its latest line. */
function ReasoningRow({ message }: { message: Message }) {
  const [open, toggle] = useDisclosure(false);
  const lines = message.text.trim().split("\n");
  // The one-line preview is plain text, so drop the Markdown marks it would show raw.
  const preview = (lines[lines.length - 1] ?? "").replace(/`+|\*\*|__/g, "");
  return (
    <div className={`ac-thought${open ? " open" : ""}`}>
      <button type="button" className="ac-thought-head" aria-expanded={open} onClick={toggle}>
        <span className="tx-chev">
          <I.Chevron size={12} />
        </span>
        <span className="ac-thought-label">{message.streaming ? "Thinking…" : "Thought"}</span>
        {!open && <span className="ac-thought-preview">{preview}</span>}
      </button>
      {open && (
        <div className="ac-thought-body">
          <ChatMarkdown text={message.text} />
        </div>
      )}
    </div>
  );
}
