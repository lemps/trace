import { I } from "@/components/Icon";
import { ChatMarkdown } from "./ChatMarkdown";
import { useDisclosure } from "./hooks/useDisclosure";
import type { Message } from "./types";

// Words in the conversation: yours as a bubble on the right, the agent's as
// Markdown prose, a system note as a quiet centred line, and its reasoning as a
// folded "Thinking" row.

export function MessageRow({ message }: { message: Message }) {
  switch (message.role) {
    case "user":
      return (
        <div className="tx-prompt">
          <div className="tx-bubble">{message.text}</div>
        </div>
      );
    case "assistant":
      return (
        <div className={`ac-reply${message.streaming ? " streaming" : ""}`}>
          <ChatMarkdown text={message.text} />
        </div>
      );
    case "system":
      return <div className="tx-notice">{message.text}</div>;
    case "reasoning":
      return <ReasoningRow message={message} />;
  }
}

/** The agent's thinking: one line, unfolding to the text. Live thinking shows its latest line. */
function ReasoningRow({ message }: { message: Message }) {
  const [open, toggle] = useDisclosure(false);
  const lines = message.text.trim().split("\n");
  const preview = lines[lines.length - 1] ?? "";
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
