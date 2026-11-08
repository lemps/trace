import { type MouseEvent, type ReactNode, useRef } from "react";
import { ContextMenu } from "@/components/ContextMenu";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { CopyButton } from "@/components/markdown/CodeBlock";
import { useContextMenuAt } from "@/components/useContextMenuAt";
import { PromptBubble } from "@/domains/transcript/PromptBubble";
import { ChatMarkdown } from "./ChatMarkdown";
import { useChatView } from "./chatContext";
import { useDisclosure } from "./hooks/useDisclosure";
import { editInComposer, messageMenu } from "./messageMenu";
import { messageTime, messageTimeFull } from "./messageText";
import type { Message } from "./types";

// Words in the conversation: yours as a bubble on the right, the agent's as
// prose (both Markdown), a system note as a quiet centred line, and its
// reasoning as a folded "Thinking" row. Yours and its replies have a hover bar
// under them (Copy, Edit on yours, and when it was said), quiet until the message
// is hovered or holds focus; right-click lists the same and the plain-text copies.

interface MessageRowProps {
  message: Message;
  /** When it was said (the journal row's time), shown in its hover bar. */
  at?: number;
}

export function MessageRow({ message, at }: MessageRowProps) {
  switch (message.role) {
    case "user":
      return (
        <MessageShell message={message} at={at} mine>
          {/* A message of only files has no text to draw or copy. */}
          <PromptBubble attachments={message.attachments}>
            {message.text.trim() && <ChatMarkdown text={message.text} />}
          </PromptBubble>
        </MessageShell>
      );
    case "assistant":
      return (
        <MessageShell message={message} at={at}>
          <div className={`ac-reply${message.streaming ? " streaming" : ""}`}>
            <ChatMarkdown text={message.text} />
          </div>
        </MessageShell>
      );
    case "system":
      return <div className="tx-notice">{message.text}</div>;
    case "reasoning":
      return <ReasoningRow message={message} />;
  }
}

interface ShellProps extends MessageRowProps {
  mine?: boolean;
  children: ReactNode;
}

/** A message with its hover bar and right-click menu. */
function MessageShell({ message, at, mine = false, children }: ShellProps) {
  const { workspaceId } = useChatView();
  const ref = useRef<HTMLDivElement>(null);
  const { menu, openAt, close } = useContextMenuAt<string | undefined>();
  // Nothing to act on while it's still being written, or for a message of only files.
  const text = !message.streaming && message.text.trim() ? message.text : null;
  // Only what you wrote goes back in your composer (not a subagent's brief from its parent).
  const edit =
    mine && text && workspaceId && !message.parentCallId
      ? () => editInComposer(workspaceId, text)
      : undefined;
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => openAt(selectionIn(ref.current))(e);
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the menu's keyboard path is its bar's buttons (the context-menu key on one bubbles here) */}
      <div
        ref={ref}
        className={`ac-msg${mine ? " mine" : ""}${menu ? " menu-open" : ""}`}
        onContextMenu={text ? onContextMenu : undefined}
      >
        {children}
        {/* The bar is there while a reply streams too, so finishing doesn't shift the chat. */}
        <div className="ac-msg-actions">
          {mine && at !== undefined && <MessageTime at={at} />}
          {edit && (
            <IconButton
              size="xs"
              className="ghost ac-msg-btn"
              label="Edit in composer"
              onClick={edit}
            >
              <I.Pencil size={12} />
            </IconButton>
          )}
          {text && <CopyButton text={text} label="Copy message" className="ac-msg-btn" />}
          {!mine && text && at !== undefined && <MessageTime at={at} />}
        </div>
      </div>
      {menu && text && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sections={messageMenu({ text, edit, selection: menu.target })}
          onClose={close}
        />
      )}
    </>
  );
}

function MessageTime({ at }: { at: number }) {
  return (
    <time className="ac-msg-time" dateTime={new Date(at).toISOString()} title={messageTimeFull(at)}>
      {messageTime(at)}
    </time>
  );
}

/** The text selected inside `el`, if any: right-click offers to copy just that. */
function selectionIn(el: HTMLElement | null): string | undefined {
  const sel = window.getSelection();
  if (!el || !sel || sel.isCollapsed || !sel.anchorNode || !el.contains(sel.anchorNode)) {
    return undefined;
  }
  return sel.toString().trim() || undefined;
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
