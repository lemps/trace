import { useMemo, useRef } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { useBoardStore } from "@/domains/board/store";
import { useChatActions } from "./actions";
import { ChatHeader } from "./ChatHeader";
import { ChatList } from "./ChatList";
import { ChatTabs } from "./ChatTabs";
import { Composer } from "./Composer";
import { type ChatView, ChatViewContext } from "./chatContext";
import { useAgentWorking, useChat, useSubagents } from "./hooks/useChat";
import { useChatKeys } from "./hooks/useChatKeys";
import { useJournalFeed } from "./hooks/useJournalFeed";
import { useQueueFlush } from "./hooks/useQueueFlush";
import { useWorkspaceRoot } from "./hooks/useWorkspaceRoot";
import { isTurnLive } from "./projection";
import { SubagentView } from "./SubagentView";
import { useAgentChatStore } from "./store";
import { openSubagentBeside, useSubagentsInPanes } from "./subagentPanel";

interface ChatAgentPaneProps {
  workspaceId: string;
  /** Open every collapsible card (the dev fixture page's screenshot mode). */
  expandAll?: boolean;
  /**
   * Start the stopped agent, the way the view's own Start does (same model,
   * provider, flags and transport). Without it (the fixture page) the agent
   * counts as always running.
   */
  onStart?: () => void;
  /** End the agent's process, the way the view's own Stop does. */
  onStop?: () => void;
}

// A chat agent's conversation, the same for every brand: the header's facts,
// a tab per subagent beside the main chat, the turns (messages, tool calls,
// diffs, plans, prompts answered in place) and the composer, which always
// talks to the main agent. This is the one seam the session and ticket views
// mount; it needs only the workspace id.
export function ChatAgentPane({
  workspaceId,
  expandAll = false,
  onStart,
  onStop,
}: ChatAgentPaneProps) {
  useJournalFeed(workspaceId);
  const actions = useChatActions();
  const live = useBoardStore((s) => s.runningAgents.has(workspaceId));
  const stopped = onStart !== undefined && !live;
  const info = useAgentChatStore((s) => s.info[workspaceId]);
  const loaded = useAgentChatStore((s) => s.loaded[workspaceId] ?? false);
  const { turns } = useChat(workspaceId);
  const subagents = useSubagents(workspaceId);
  const last = turns[turns.length - 1];
  const busy = info?.busy ?? isTurnLive(last);
  const working = useAgentWorking(workspaceId) && !stopped;
  const running = subagents.filter((s) => s.status === "running").length;
  const stored = useAgentChatStore((s) => s.tab[workspaceId] ?? "main");
  // A subagent open in a pane of its own isn't also a tab here: picking it goes there.
  const inPanes = useSubagentsInPanes(workspaceId, subagents);
  const listed = subagents.some((s) => s.callId === stored) && !inPanes.has(stored);
  const tab = listed ? stored : "main";
  const setTab = (t: string) => {
    if (t !== "main" && inPanes.has(t)) openSubagentBeside(workspaceId, t);
    else useAgentChatStore.getState().setTab(workspaceId, t);
  };
  const steppable = subagents.filter((s) => !inPanes.has(s.callId));
  const root = useWorkspaceRoot(workspaceId);
  const view = useMemo<ChatView>(
    () => ({ workspaceId, root, expandAll }),
    [workspaceId, root, expandAll]
  );
  useQueueFlush(workspaceId, busy);

  const interrupt = () =>
    void actions
      .interrupt(workspaceId)
      .catch((e) => toast.error(`Couldn't interrupt: ${String(e)}`));
  const paneRef = useRef<HTMLDivElement>(null);
  useChatKeys(paneRef, { working, interrupt, subagents: steppable, tab, setTab });

  return (
    <ChatViewContext.Provider value={view}>
      <div className="ac-pane" ref={paneRef}>
        <ChatHeader info={info} turns={turns} onStop={live ? onStop : undefined} />
        {subagents.length > 0 && (
          <ChatTabs subagents={subagents} inPanes={inPanes} active={tab} onPick={setTab} />
        )}
        {/* Main stays mounted under a subagent's tab, so it keeps its place. */}
        <div className="ac-main" hidden={tab !== "main"}>
          {turns.length === 0 ? (
            <Empty loaded={loaded} stopped={stopped} onStart={onStart} />
          ) : (
            <ChatList
              turns={turns}
              working={working}
              since={
                busy && isTurnLive(last) && last
                  ? (last.prompts[0]?.row.at ?? last.startedAt)
                  : null
              }
              subagents={running}
            />
          )}
        </div>
        {tab !== "main" && <SubagentView workspaceId={workspaceId} callId={tab} />}
        {stopped && turns.length > 0 && (
          // Its own band under the conversation, which scrolls above it.
          <div className="ac-stopped">
            <div className="ac-stopped-in">
              <span>The agent isn't running. Start it to carry on this conversation.</span>
              <button type="button" className="btn primary" onClick={onStart}>
                <I.Bolt size={13} /> Start
              </button>
            </div>
          </div>
        )}
        <Composer
          workspaceId={workspaceId}
          busy={busy}
          working={working}
          onInterrupt={interrupt}
          toMain={tab !== "main"}
          slashCommands={info?.slashCommands ?? []}
        />
      </div>
    </ChatViewContext.Provider>
  );
}

function Empty({
  loaded,
  stopped,
  onStart,
}: {
  loaded: boolean;
  stopped: boolean;
  onStart?: () => void;
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
        {stopped
          ? "The agent isn't running. Start it, then send it a message."
          : "Nothing here yet. Your messages and the agent's work will show up here."}
        {stopped && onStart && (
          <button type="button" className="btn primary" onClick={onStart}>
            <I.Bolt size={13} /> Start
          </button>
        )}
      </div>
    </div>
  );
}
