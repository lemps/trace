import { type KeyboardEvent, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { isShortcut, useHint } from "@/platform/shortcuts";
import { useChatActions } from "./actions";
import { QueueList } from "./QueueList";
import { SlashMenu, slashMatches } from "./SlashMenu";
import { useAgentChatStore } from "./store";

interface ComposerProps {
  workspaceId: string;
  busy: boolean;
  slashCommands: readonly string[];
}

/** The textarea grows with its text up to this many lines, then scrolls. */
const MAX_ROWS = 10;

// Where you talk to the agent. Enter sends (Shift+Enter is a new line); while
// the agent works, Enter queues the message instead and Esc interrupts the
// turn. Typing `/` lists the agent's slash commands.
export function Composer({ workspaceId, busy, slashCommands }: ComposerProps) {
  const actions = useChatActions();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [menuClosed, setMenuClosed] = useState(false);
  const matches = menuClosed ? null : slashMatches(text, slashCommands);
  const sendHint = useHint("chatSend");
  const newlineHint = useHint("chatNewline");
  const interruptHint = useHint("chatInterrupt");

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
  const interrupt = () => {
    void actions
      .interrupt(workspaceId)
      .catch((e) => toast.error(`Couldn't interrupt: ${String(e)}`));
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
    } else if (isShortcut("chatInterrupt", e) && busy) {
      e.preventDefault();
      e.stopPropagation();
      interrupt();
    }
  };

  const rows = Math.min(MAX_ROWS, Math.max(1, text.split("\n").length));
  return (
    <div className="ac-composer-wrap">
      <QueueList workspaceId={workspaceId} />
      <div className="ac-composer">
        {matches && <SlashMenu matches={matches} active={active} onPick={pick} />}
        <textarea
          className="ac-input"
          aria-label="Message the agent"
          placeholder={busy ? "Queue a message for when this turn ends" : "Message the agent"}
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
          <span className="ac-composer-hints">
            <span className="kbd">{sendHint}</span> {busy ? "queues" : "sends"} ·{" "}
            <span className="kbd">{newlineHint}</span> new line
            {busy && (
              <>
                {" "}
                · <span className="kbd">{interruptHint}</span> interrupts
              </>
            )}
            {slashCommands.length > 0 && " · / for commands"}
          </span>
          {busy && (
            <button type="button" className="btn" onClick={interrupt}>
              <I.X size={13} /> Interrupt
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={!text.trim()}
            onClick={submit}
            aria-label={busy ? "Queue the message" : "Send the message"}
          >
            <I.Send size={13} /> {busy ? "Queue" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
