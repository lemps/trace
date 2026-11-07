import { useState } from "react";
import { Switch } from "@/components/Switch";
import {
  agentArgsRaw,
  agentCli,
  agentModelRaw,
  agentProvider,
  agentTransport,
  autoStartOnMove,
  DEFAULT_KICKOFF_PROMPT,
  kickoffPromptRaw,
  setAgentArgs,
  setAgentCli,
  setAgentModel,
  setAgentProvider,
  setAgentTransport,
  setAutoStartOnMove,
  setKickoffPrompt,
} from "@/domains/agent/defaults";
import { useHasChat } from "@/domains/agentChat/transport";
import type { AgentCli, AgentProvider, Transport } from "@/ipc/agent";
import { ProviderKeyField } from "./ProviderKeyField";
import { SettingRow } from "./SettingRow";

// What a new agent starts with: harness, provider, model, arguments, kickoff brief.
export function AgentDefaultsSettings() {
  const [cli, setCli] = useState<AgentCli>(agentCli);
  const [provider, setProvider] = useState<AgentProvider>(agentProvider);
  const [model, setModel] = useState(agentModelRaw);
  const [args, setArgs] = useState(agentArgsRaw);
  const [kickoff, setKickoff] = useState(kickoffPromptRaw);
  const [autoStart, setAutoStart] = useState(autoStartOnMove);
  const [transport, setTransport] = useState<Transport>(agentTransport);
  const codexChat = useHasChat("codex");

  const chooseCli = (next: AgentCli) => {
    setCli(next);
    setAgentCli(next);
  };
  const chooseProvider = (next: AgentProvider) => {
    setProvider(next);
    setAgentProvider(next);
  };
  const chooseModel = (next: string) => {
    setModel(next);
    setAgentModel(next);
  };
  const chooseArgs = (next: string) => {
    setArgs(next);
    setAgentArgs(next);
  };
  const chooseKickoff = (next: string) => {
    setKickoff(next);
    setKickoffPrompt(next);
  };
  const chooseTransport = (next: Transport) => {
    setTransport(next);
    setAgentTransport(next);
  };
  const chooseAutoStart = (next: boolean) => {
    setAutoStart(next);
    setAutoStartOnMove(next);
  };

  return (
    <section className="setting-group">
      <h2>Agent defaults</h2>
      <div className="desc">Applied when you start a new coding session.</div>
      <SettingRow label="Default agent" hint="Pre-selected when starting a session.">
        <select
          aria-label="Default agent"
          value={cli}
          onChange={(e) => chooseCli(e.target.value as AgentCli)}
        >
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
      </SettingRow>
      {cli === "claude" && (
        <SettingRow
          label="Provider"
          hint="Third-party providers run the same Claude Code harness against their API."
        >
          <select
            aria-label="Default provider"
            value={provider}
            onChange={(e) => chooseProvider(e.target.value as AgentProvider)}
          >
            <option value="anthropic">Anthropic</option>
            <option value="moonshot">Kimi (Moonshot)</option>
            <option value="wafer">Kimi (Wafer)</option>
            <option value="wafer-fast">Kimi Fast (Wafer)</option>
            <option value="deepseek">DeepSeek Flash</option>
            <option value="deepseek-pro">DeepSeek Pro</option>
          </select>
        </SettingRow>
      )}
      {cli === "claude" && provider !== "anthropic" && <ProviderKeyField provider={provider} />}
      <SettingRow
        label="Shows as"
        hint={`Chat shows the agent as a formatted conversation, Terminal as its own TUI. A ticket or session can pick the other when it starts, and keeps its choice.${codexChat ? "" : " Codex has no chat view yet, so it always runs in a terminal."}`}
      >
        <select
          aria-label="Show agents as"
          value={transport}
          onChange={(e) => chooseTransport(e.target.value as Transport)}
        >
          <option value="chat">Chat</option>
          <option value="terminal">Terminal</option>
        </select>
      </SettingRow>
      <SettingRow label="Default model" hint="Passed as --model. Blank uses the CLI default.">
        <input
          type="text"
          aria-label="Default model"
          placeholder="e.g. opus, sonnet"
          value={model}
          onChange={(e) => chooseModel(e.target.value)}
        />
      </SettingRow>
      <SettingRow label="Extra arguments" hint="Appended verbatim, split on spaces.">
        <input
          type="text"
          aria-label="Extra arguments"
          placeholder="e.g. --add-dir ../shared"
          value={args}
          onChange={(e) => chooseArgs(e.target.value)}
        />
      </SettingRow>
      <SettingRow
        label="Auto-start on move"
        hint="Dragging a card to In Progress starts its agent with the kickoff prompt."
      >
        <Switch
          on={autoStart}
          onChange={chooseAutoStart}
          label="Auto-start agents on move to In Progress"
        />
      </SettingRow>
      <div className="setting-block">
        <div className="label">Kickoff prompt</div>
        <div className="hint">
          Sent to the agent when you start it from the board (Start on a card or, with auto-start
          on, dragging to In&nbsp;Progress). Placeholders: {"{key}"}, {"{summary}"},{" "}
          {"{description}"}, {"{comments}"} (the ticket's discussion thread, fetched at launch).
          Blank uses the default.
        </div>
        <textarea
          aria-label="Kickoff prompt"
          rows={4}
          placeholder={DEFAULT_KICKOFF_PROMPT}
          value={kickoff}
          onChange={(e) => chooseKickoff(e.target.value)}
        />
      </div>
    </section>
  );
}
