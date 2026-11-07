import { I } from "@/components/Icon";
import { ChatSurface } from "@/domains/agent/ChatSurface";
import { ChatAgentPane } from "@/domains/agentChat/ChatAgentPane";
import { useIsChatAgent } from "@/domains/agentChat/transport";
import type { AgentCli } from "@/ipc/agent";
import type { AgentRun } from "./hooks/useAgentRun";

interface AgentPaneProps {
  /** The agent's workspace id — the session's id, or a companion's. */
  workspaceId: string;
  cli: AgentCli;
  run: AgentRun;
  /** Copy for the start overlay: what this agent will be working in. */
  hint: string;
}

// One agent's chat pane (its terminal, or its transcript), with the start overlay
// it shows while stopped and the answer bar while it waits on a permission or
// plan prompt. Used for
// both the session's own agent and every companion agent — they differ only in
// workspace id and how they're spawned (see useAgentRun).
export function AgentPane({ workspaceId, cli, run, hint }: AgentPaneProps) {
  const isChat = useIsChatAgent(workspaceId);
  if (isChat) return <ChatAgentPane workspaceId={workspaceId} />;
  return (
    <ChatSurface workspaceId={workspaceId} cli={cli}>
      {!run.running && (
        <div className="empty-state">
          <div className="inner">
            <span className="ic">
              <I.Sparkles size={28} />
            </span>
            <div className="title">Start {cli}</div>
            <div className="hint">{hint}</div>
            <button
              type="button"
              className="btn primary"
              style={{ marginTop: 6 }}
              onClick={() => void run.start()}
            >
              <I.Bolt size={13} /> Start {cli}
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => void run.startFresh()}
              title="Forget the saved conversation and begin a new one — use this if you see “session not found”."
            >
              Start fresh conversation
            </button>
          </div>
        </div>
      )}
    </ChatSurface>
  );
}
