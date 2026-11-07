import { useEffect } from "react";
import { onAgentJournal, onAgentSessionInfo } from "@/ipc/agentChat";
import { useChatActions } from "../actions";
import { useAgentChatStore } from "../store";

// Keeps the store fed: one app-wide subscription to `agent-journal` and
// `agent-session-info` (started by the first chat view, never torn down, so rows
// for agents not on screen still land), and each view's saved journal read once.
// Rows from the load and from events can interleave; upserting by revision makes
// the order irrelevant.

let listening = false;

/** Start the app-wide event subscription (idempotent). */
export function ensureChatListeners(): void {
  if (listening) return;
  listening = true;
  const { applyRows, setInfo } = useAgentChatStore.getState();
  void onAgentJournal((e) => applyRows(e.workspaceId, e.rows)).catch(() => {
    listening = false;
  });
  void onAgentSessionInfo((e) => setInfo(e.workspaceId, e.info)).catch(() => {});
}

/** Load `workspaceId`'s saved journal and keep it current. */
export function useJournalFeed(workspaceId: string): void {
  const actions = useChatActions();
  useEffect(() => {
    ensureChatListeners();
    const { loaded, applyRows, markLoaded } = useAgentChatStore.getState();
    if (loaded[workspaceId]) return;
    let cancelled = false;
    void actions
      .load(workspaceId)
      .then((rows) => {
        if (!cancelled) applyRows(workspaceId, rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) markLoaded(workspaceId);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, actions]);
}
