import { useEffect } from "react";
import { toast } from "@/app/toast";
import { onAgentJournal, onAgentSessionInfo } from "@/ipc/agentChat";
import { useChatActions } from "../actions";
import { noteChatInfo, noteChatRows } from "../liveBridge";
import { useAgentChatStore } from "../store";

// Keeps the store fed: one app-wide subscription to `agent-journal` and
// `agent-session-info` (started with the app, never torn down, so rows for
// agents not on screen still land and reach the board via `liveBridge`), and
// each view's saved journal read once.
// Rows from the load and from events can interleave; upserting by revision makes
// the order irrelevant.

let listening = false;
/** Workspaces whose saved journal was read; a failed read is retried on the next mount. */
const fetched = new Set<string>();

/** Start the app-wide event subscription (idempotent). */
export function ensureChatListeners(): void {
  if (listening) return;
  listening = true;
  const { applyRows, resetRows, setInfo } = useAgentChatStore.getState();
  void onAgentJournal((e) => {
    if (e.reset) resetRows(e.workspaceId, e.rows);
    else applyRows(e.workspaceId, e.rows);
    noteChatRows(e.workspaceId, e.rows);
  }).catch(() => {
    listening = false;
  });
  void onAgentSessionInfo((e) => {
    noteChatInfo(e.workspaceId, e.info);
    setInfo(e.workspaceId, e.info);
  }).catch(() => {});
}

/** Load `workspaceId`'s saved journal and keep it current. */
export function useJournalFeed(workspaceId: string): void {
  const actions = useChatActions();
  useEffect(() => {
    ensureChatListeners();
    const { applyRows, markLoaded } = useAgentChatStore.getState();
    if (fetched.has(workspaceId)) return;
    let cancelled = false;
    void actions
      .load(workspaceId)
      .then((rows) => {
        fetched.add(workspaceId);
        if (cancelled) return;
        applyRows(workspaceId, rows);
        // A running agent's prompt still open from before this view (or a reload).
        noteChatRows(workspaceId, rows);
      })
      .catch((e) => {
        if (!cancelled) toast.error(`Couldn't read the conversation: ${String(e)}`);
      })
      .finally(() => {
        if (!cancelled) markLoaded(workspaceId);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, actions]);
}
