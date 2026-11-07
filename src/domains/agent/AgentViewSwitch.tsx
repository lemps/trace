import { useIsChatAgent } from "@/domains/agentChat/transport";
import { ViewSwitch } from "@/domains/transcript/ViewSwitch";
import type { AgentCli } from "@/ipc/agent";

/**
 * Transcript | Terminal for an agent's tab, at the end of the strip it's shown in —
 * nothing for a chat agent, whose chat is its only view.
 */
export function AgentViewSwitch({ workspaceId, cli }: { workspaceId: string; cli: AgentCli }) {
  const isChat = useIsChatAgent(workspaceId);
  return isChat ? null : <ViewSwitch workspaceId={workspaceId} cli={cli} />;
}
