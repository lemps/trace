import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { KeyHint } from "@/components/KeyHint";
import { isShortcut, useAriaKeys, useTitleWithHint } from "@/platform/shortcuts";
import { useChatActions } from "./actions";
import { useComposerFill } from "./composerFill";
import { QueueList } from "./QueueList";
import { SlashMenu, slashMatches } from "./SlashMenu";
import { useAgentChatStore } from "./store";

interface ComposerProps {
  workspaceId: string;
  /** A turn is running: Enter queues. */
  busy: boolean;
  /** Anything runs (a turn, or subagents after it): there's something to interrupt. */
  working: boolean;
  onInterrupt: () => void;
  /** A subagent's tab is showing; messages still go to the main agent. */
  toMain: boolean;
  slashCommands: readonly string[];
}

/** The textarea grows with its text up to this many lines, then scrolls. */
const MAX_ROWS = 10;

// Where you talk to the agent (the main one; subagents are read-only). Enter
// sends (Shift+Enter is a new line); while a turn runs, Enter queues the message
// instead. Esc interrupts (the pane hears it, wherever focus is). Typing `/`
// lists the agent's slash commands. The keys are in the buttons' tooltips and the
// cheat sheet, not spelled out under the box.
export function Composer({
  workspaceId,
  busy,
  working,
  onInterrupt,
  toMain,
  slashCommands,
}: ComposerProps) {
  const actions = useChatActions();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [menuClosed, setMenuClosed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Text put here from elsewhere (the Plan tab), to edit and send yourself.
  const pending = useComposerFill((s) => s.pending[workspaceId]);
  useEffect(() => {
    if (pending === undefined) return;
    const text = useComposerFill.getState().take(workspaceId);
    if (!text) return;
    setText((was) => (was.trim() ? `${was}\n\n${text}` : text));
    inputRef.current?.focus();
  }, [pending, workspaceId]);
  const matches = menuClosed ? null : slashMatches(text, slashCommands);
  const interruptTitle = `${useTitleWithHint("Interrupt", "chatInterrupt")}: stops the turn and its subagents`;
  const interruptKeys = useAriaKeys("chatInterrupt");
  const sendTitle = useTitleWithHint(busy ? "Queue the message" : "Send the message", "chatSend");
  const slash = slashCommands.length > 0 ? ", / for commands" : "";

  const submit = () => {
    const message = text.trim();
    if (!message) return;
    setText("");
    const { queues, sending, enqueue, setSending } = useAgentChatStore.getState();
    if (busy || sending[workspaceId] || (queues[workspaceId]?.length ?? 0) > 0) {
      enqueue(workspaceId, message);
      return;
    }
    setSending(workspaceId, true);
    void actions.send(workspaceId, { text: message, attachments: [] }).catch((e) => {
      setSending(workspaceId, false);
      setText(message);
      toast.error(`Couldn't send: ${String(e)}`);
    });
  };
  const pick = (command: string) => {
    setText(`/${command} `);
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an IME is composing commits the candidate; it isn't a send.
    if (e.nativeEvent.isComposing) return;
    if (matches) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((a) => (a + step + matches.length) % matches.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        pick(matches[Math.min(active, matches.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMenuClosed(true);
        return;
      }
    }
    if (isShortcut("chatSend", e)) {
      e.preventDefault();
      submit();
    }
  };

  const rows = Math.min(MAX_ROWS, Math.max(1, text.split("\n").length));
  return (
    <div className="ac-composer-wrap">
      <QueueList workspaceId={workspaceId} />
      <div className="ac-composer">
        {matches && <SlashMenu matches={matches} active={active} onPick={pick} />}
        <textarea
          ref={inputRef}
          className="ac-input"
          aria-label="Message the agent"
          placeholder={
            busy
              ? `Queue a message for when this turn ends${slash}`
              : toMain
                ? `Message the main agent${slash}`
                : `Message the agent${slash}`
          }
          rows={rows}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setMenuClosed(false);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="ac-composer-bar">
          {working && (
            <button
              type="button"
              className="btn icon ac-stop"
              onClick={onInterrupt}
              title={interruptTitle}
              aria-label="Interrupt"
              aria-keyshortcuts={interruptKeys}
            >
              <I.Stop size={12} />
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={!text.trim()}
            onClick={submit}
            title={sendTitle}
            aria-label={busy ? "Queue the message" : "Send the message"}
          >
            <I.Send size={13} /> {busy ? "Queue" : "Send"} <KeyHint id="chatSend" />
          </button>
        </div>
      </div>
    </div>
  );
}
