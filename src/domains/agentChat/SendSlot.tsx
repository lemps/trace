import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { SplitButton } from "@/components/SplitButton";
import { useHint } from "@/platform/shortcuts";
import type { DeliverHow } from "./hooks/useDeliver";

interface SendSlotProps {
  /** A turn is running: a message sent now joins it. */
  busy: boolean;
  /** Anything runs (a turn, or subagents after it): there's something to stop. */
  working: boolean;
  /** Something is typed or attached. */
  hasDraft: boolean;
  /** The draft can go (it has content and its files are saved). */
  canSend: boolean;
  /** The agent is stopped: sending starts it first. */
  starts?: boolean;
  onSend: (how?: DeliverHow) => void;
  onStop: () => void;
}

// The composer's one primary (trace-ui §1): Send, and Stop while the agent
// works and there's nothing to send. Typing while it works makes it a split
// button: Send now steers the running turn, and the caret also offers Queue (for
// when the turn ends) and Interrupt and send. Esc stops a turn whichever it shows.
export function SendSlot({
  busy,
  working,
  hasDraft,
  canSend,
  starts = false,
  onSend,
  onStop,
}: SendSlotProps) {
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
  if (working && !starts) {
    return <SteerSplit busy={busy} canSend={canSend} onSend={onSend} />;
  }
  return (
    <IconButton
      className="primary ac-send"
      label={starts ? "Start and send" : "Send"}
      shortcut="chatSend"
      disabled={!canSend}
      onClick={() => onSend("now")}
    >
      <I.Send size={14} />
    </IconButton>
  );
}

interface SteerSplitProps {
  busy: boolean;
  canSend: boolean;
  onSend: (how: DeliverHow) => void;
}

/** Send now ▾, while the agent works and something is typed. */
function SteerSplit({ busy, canSend, onSend }: SteerSplitProps) {
  const nowHint = useHint("chatSend");
  const queueHint = useHint("chatQueue");
  const interruptHint = useHint("chatInterruptSend");
  return (
    <SplitButton
      primary
      up
      className="ac-send-split"
      menuLabel="More ways to send"
      disabled={!canSend}
      sections={[
        {
          items: [
            {
              label: "Send now",
              detail: busy
                ? "It reads this after its current step"
                : "Starts a turn while its subagents work",
              hint: nowHint,
              onSelect: () => onSend("now"),
            },
            {
              label: "Queue",
              detail: busy ? "Sent when this turn ends" : "Sent in order after what's queued",
              hint: queueHint,
              onSelect: () => onSend("queue"),
            },
            {
              label: "Interrupt and send",
              detail: busy ? "Stops the turn, then sends this" : "Stops its subagents first",
              hint: interruptHint,
              onSelect: () => onSend("interrupt"),
            },
          ],
        },
      ]}
    >
      <IconButton
        className="primary"
        label="Send now"
        shortcut="chatSend"
        disabled={!canSend}
        onClick={() => onSend("now")}
      >
        <I.Send size={14} />
      </IconButton>
    </SplitButton>
  );
}
