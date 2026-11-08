import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";

interface SendSlotProps {
  /** A turn is running: a message waits in the queue rather than going now. */
  busy: boolean;
  /** Anything runs (a turn, or subagents after it): there's something to stop. */
  working: boolean;
  /** Something is typed or attached. */
  hasDraft: boolean;
  /** The draft can go (it has content and its files are saved). */
  canSend: boolean;
  onSend: () => void;
  onStop: () => void;
}

// The composer's one primary (trace-ui §2 rule 5): Send, Queue while a turn runs,
// and Stop while the agent works and there's nothing to send. It's one square slot,
// so swapping never shifts the pickers beside it. Esc stops a turn whichever it shows.
export function SendSlot({ busy, working, hasDraft, canSend, onSend, onStop }: SendSlotProps) {
  if (working && !hasDraft) {
    return (
      <IconButton
        className="primary ac-send"
        label="Stop"
        shortcut="chatInterrupt"
        onClick={onStop}
      >
        <I.Stop size={14} />
      </IconButton>
    );
  }
  return (
    <IconButton
      className="primary ac-send"
      label={busy ? "Queue" : "Send"}
      shortcut="chatSend"
      disabled={!canSend}
      onClick={onSend}
    >
      {busy ? <I.ListPlus size={14} /> : <I.Send size={14} />}
    </IconButton>
  );
}
