import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { workspaceInfo } from "@/ipc/workspace";
import { isShortcut } from "@/platform/shortcuts";
import { useChatActions } from "./actions";
import { ChatHeader } from "./ChatHeader";
import { ChatList } from "./ChatList";
import { Composer } from "./Composer";
import { type ChatView, ChatViewContext } from "./chatContext";
import { useJournalFeed } from "./hooks/useJournalFeed";
import { useQueueFlush } from "./hooks/useQueueFlush";
import { buildTurns, isTurnLive } from "./projection";
import { useAgentChatStore, useJournal } from "./store";

interface ChatAgentPaneProps {
  workspaceId: string;
  /** Open every collapsible card (the dev fixture page's screenshot mode). */
  expandAll?: boolean;
}

// A chat agent's conversation, the same for every brand: the header's facts,
// the turns (messages, tool calls, diffs, plans, prompts answered in place) and
// the composer. This is the one seam the session and ticket views mount; it
// needs only the workspace id.
export function ChatAgentPane({ workspaceId, expandAll = false }: ChatAgentPaneProps) {
  useJournalFeed(workspaceId);
  const actions = useChatActions();
  const journal = useJournal(workspaceId);
  const info = useAgentChatStore((s) => s.info[workspaceId]);
  const loaded = useAgentChatStore((s) => s.loaded[workspaceId] ?? false);
  const turns = useMemo(() => buildTurns(journal.rows), [journal.rows]);
  const last = turns[turns.length - 1];
  const busy = info?.busy ?? isTurnLive(last);
  const root = useWorkspaceRoot(workspaceId);
  const view = useMemo<ChatView>(
    () => ({ workspaceId, root, expandAll }),
    [workspaceId, root, expandAll]
  );
  useQueueFlush(workspaceId, busy);

  // Esc in the pane interrupts a running turn, but not from a text box (a
  // question's typed answer): Esc there means leave the box, not stop the agent.
  // The composer handles its own Esc.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!busy || e.defaultPrevented || !isShortcut("chatInterrupt", e)) return;
    const el = e.target as HTMLElement;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
    e.preventDefault();
    e.stopPropagation();
    void actions.interrupt(workspaceId).catch((err) => toast.error(String(err)));
  };

  return (
    <ChatViewContext.Provider value={view}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: catches Esc bubbling from the pane's controls */}
      <div className="ac-pane" onKeyDown={onKeyDown}>
        <ChatHeader info={info} turns={turns} />
        {turns.length === 0 ? (
          <Empty
            loaded={loaded}
            hasAgent={info !== undefined}
            onStart={() => void actions.start(workspaceId).catch((e) => toast.error(String(e)))}
          />
        ) : (
          <ChatList
            turns={turns}
            working={busy}
            since={
              busy && isTurnLive(last) && last ? (last.prompts[0]?.row.at ?? last.startedAt) : null
            }
          />
        )}
        <Composer workspaceId={workspaceId} busy={busy} slashCommands={info?.slashCommands ?? []} />
      </div>
    </ChatViewContext.Provider>
  );
}

function Empty({
  loaded,
  hasAgent,
  onStart,
}: {
  loaded: boolean;
  hasAgent: boolean;
  onStart: () => void;
}) {
  if (!loaded) {
    return (
      <div className="tx-empty">
        <div className="ib-empty">Reading the conversation…</div>
      </div>
    );
  }
  return (
    <div className="tx-empty">
      <div className="ib-empty ac-empty">
        {hasAgent
          ? "Nothing here yet. Your messages and the agent's work will show up here."
          : "The agent isn't running. Start it, then send it a message."}
        {!hasAgent && (
          <button type="button" className="btn primary" onClick={onStart}>
            <I.Bolt size={13} /> Start
          </button>
        )}
      </div>
    </div>
  );
}

/** The workspace's directory, so paths inside it read relative to it. */
function useWorkspaceRoot(workspaceId: string): string | null {
  const [root, setRoot] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void workspaceInfo(workspaceId)
      .then((info) => {
        if (!cancelled) setRoot(info?.cwd ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);
  return root;
}
