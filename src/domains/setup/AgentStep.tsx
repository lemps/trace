import { useState } from "react";
import { Segmented } from "@/components/Segmented";
import { agentCli, agentTransport, setAgentCli, setAgentTransport } from "@/domains/agent/defaults";
import { useHasChat } from "@/domains/agentChat/transport";
import { SettingRow } from "@/domains/settings/SettingRow";
import type { AgentCli, Transport } from "@/ipc/agent";
import { PreflightList } from "./PreflightList";

const CLIS = [
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
] as const;

const VIEWS = [
  { value: "chat", label: "Chat" },
  { value: "terminal", label: "Terminal" },
] as const;

// Step 1: is this computer ready, then which agent new sessions start and how it
// shows. Both write the same defaults as Settings → Agents, as soon as they change.
export function AgentStep() {
  const [cli, setCli] = useState<AgentCli>(agentCli);
  const [transport, setTransport] = useState<Transport>(agentTransport);
  const codexChat = useHasChat("codex");

  const chooseCli = (next: AgentCli) => {
    setCli(next);
    setAgentCli(next);
  };
  const chooseTransport = (next: Transport) => {
    setTransport(next);
    setAgentTransport(next);
  };

  const viewHint =
    cli === "codex" && !codexChat
      ? "Codex has no chat view yet, so it always runs in its terminal."
      : "Chat shows a formatted conversation; Terminal shows the agent's own screen.";

  return (
    <>
      <PreflightList />
      <div className="su-rows">
        <SettingRow label="Default agent" hint="Pre-selected when you start a session.">
          <Segmented label="Default agent" value={cli} options={CLIS} onChange={chooseCli} />
        </SettingRow>
        <SettingRow label="Shows as" hint={viewHint}>
          <Segmented
            label="Show agents as"
            value={transport}
            options={VIEWS}
            onChange={chooseTransport}
          />
        </SettingRow>
      </div>
      <div className="su-note">
        Provider, model and the kickoff prompt are in Settings → Agents.
      </div>
    </>
  );
}
