import { useIsChatAgent } from "@/domains/agentChat/transport";
import { ViewSwitch } from "@/domains/transcript/ViewSwitch";
import type { AgentCli } from "@/ipc/agent";
import { useCapabilities } from "./capabilities";

/**
 * Transcript | Terminal for an agent's tab, at the end of the strip it's shown in —
 * nothing for a chat agent, whose chat is its only view, or for one whose host
 * keeps its conversation out of reach (a Vercel sandbox).
 */
export function AgentViewSwitch({ workspaceId, cli }: { workspaceId: string; cli: AgentCli }) {
  const isChat = useIsChatAgent(workspaceId);
  const caps = useCapabilities(workspaceId);
  return isChat || caps?.transcript === false ? null : (
    <ViewSwitch workspaceId={workspaceId} cli={cli} />
  );
}
