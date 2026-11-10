import { toast } from "@/app/toast";
import { useChatActions } from "../actions";
import { useDrafts } from "../drafts";
import { useAgentChatStore } from "../store";

/**
 * How a message goes while the agent works. `now` steers the running turn (the
 * agent reads it after its current step); `queue` waits for the turn to end;
 * `interrupt` stops the turn and sends it first. With nothing running, each sends.
 */
export type DeliverHow = "now" | "queue" | "interrupt";

interface DeliverDeps {
  workspaceId: string;
  /** A turn is running. */
  busy: boolean;
  /** Anything runs (a turn, or subagents after it). */
  working: boolean;
  onInterrupt: () => void;
  /** Set while the agent is stopped: sending starts it. */
  onStart?: () => void;
}

export type Deliver = (message: string, attachments: string[], how: DeliverHow) => void;

// Where a message from the composer (or a queued one sent early) goes. Both
// brands take a message mid-turn: Claude reads it after its current tool call,
// Codex gets it as `turn/steer` (and keeps it for the next turn if it can't).
export function useDeliver({
  workspaceId,
  busy,
  working,
  onInterrupt,
  onStart,
}: DeliverDeps): Deliver {
  const actions = useChatActions();
  const sendNow = (message: string, attachments: string[]) =>
    actions.send(workspaceId, { text: message, attachments }).catch((e) => {
      useAgentChatStore.getState().setSending(workspaceId, false);
      // Back in the box to try again (whatever was typed since is replaced, as before).
      useDrafts.getState().setText(workspaceId, message);
      useDrafts.getState().setAttachments(workspaceId, attachments);
      toast.error(`Couldn't send: ${String(e)}`);
    });

  return (message, attachments, how) => {
    if (message === "" && attachments.length === 0) return;
    const { queues, sending, enqueue, setSending } = useAgentChatStore.getState();
    // Writing to a stopped agent means wanting it: start it, and the queue sends this once it's up.
    if (onStart) {
      enqueue(workspaceId, message, attachments);
      onStart();
      return;
    }
    if (how === "interrupt" && working) {
      // First in line, so it's what the agent hears once the turn has stopped.
      enqueue(workspaceId, message, attachments, true);
      onInterrupt();
      return;
    }
    if (how === "queue") {
      enqueue(workspaceId, message, attachments);
      return;
    }
    // Into the running turn. Not `sending`: that waits for a new turn, and this
    // joins the one already running.
    if (busy) {
      void sendNow(message, attachments);
      return;
    }
    // Idle, but queued messages are on their way: keep the order typed.
    if (sending[workspaceId] || (queues[workspaceId]?.length ?? 0) > 0) {
      enqueue(workspaceId, message, attachments);
      return;
    }
    setSending(workspaceId, true);
    void sendNow(message, attachments);
  };
}
