import { useEffect } from "react";
import { toast } from "@/app/toast";
import { useChatActions } from "../actions";
import { useAgentChatStore, useQueue } from "../store";

/** How long to wait for the agent to pick up a sent message before sending the next anyway. */
const PICKUP_MS = 5000;

// Sends queued messages in order, one per turn: when the agent is idle, the
// first queued message goes and leaves the queue. `sending` holds the next one
// back until the agent reports busy (or starts a turn), so two never race into
// the same idle gap.
export function useQueueFlush(workspaceId: string, busy: boolean): void {
  const actions = useChatActions();
  const queue = useQueue(workspaceId);
  const sending = useAgentChatStore((s) => s.sending[workspaceId] ?? false);
  const next = queue[0];

  useEffect(() => {
    if (busy || sending || !next) return;
    const { removeQueued, setSending } = useAgentChatStore.getState();
    removeQueued(workspaceId, next.id);
    setSending(workspaceId, true);
    void actions.send(workspaceId, { text: next.text, attachments: [] }).catch((e) => {
      setSending(workspaceId, false);
      toast.error(`Couldn't send the queued message: ${String(e)}`);
    });
  }, [busy, sending, next, workspaceId, actions]);

  // Fallback: an agent that never reports busy shouldn't strand the queue.
  useEffect(() => {
    if (!sending) return;
    const t = window.setTimeout(
      () => useAgentChatStore.getState().setSending(workspaceId, false),
      PICKUP_MS
    );
    return () => window.clearTimeout(t);
  }, [sending, workspaceId]);
}
