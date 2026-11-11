import { Segmented } from "@/components/Segmented";
import type { AgentCli, AgentProvider, Transport } from "@/ipc/agent";
import type { SessionHostKind } from "./types";

interface NewSessionMoreProps {
  title: string;
  onTitle: (next: string) => void;
  /** Only offered while Vercel is connected. */
  showHost: boolean;
  hostPick: SessionHostKind | "local";
  onHost: (next: SessionHostKind | "local") => void;
  cli: AgentCli;
  host: SessionHostKind | null;
  provider: AgentProvider;
  onProvider: (next: AgentProvider) => void;
  shownAs: Transport;
  onTransport: (next: Transport) => void;
  canChat: boolean;
  needsLogin: boolean;
}

/** "Run on": this computer (null) or a Vercel Sandbox. */
const HOSTS: { value: SessionHostKind | "local"; label: string }[] = [
  { value: "local", label: "This computer" },
  { value: "vercel", label: "Vercel" },
];

// The New session dialog's second tier: what you rarely change. A name of your own
// (otherwise the task is named for you), where it runs, which endpoint is behind
// Claude, and whether it opens as a chat or a terminal.
export function NewSessionMore({
  title,
  onTitle,
  showHost,
  hostPick,
  onHost,
  cli,
  host,
  provider,
  onProvider,
  shownAs,
  onTransport,
  canChat,
  needsLogin,
}: NewSessionMoreProps) {
  return (
    <div className="ns-more-fields">
      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="field-input"
          type="text"
          placeholder="Named from the task"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
        />
      </label>
      {showHost && (
        <div className="field">
          <span className="field-label">Run on</span>
          <Segmented label="Run on" value={hostPick} options={HOSTS} onChange={onHost} />
        </div>
      )}
      {cli === "claude" && (
        <label className="field">
          <span className="field-label">Provider</span>
          <select
            className="field-input"
            value={provider}
            onChange={(e) => onProvider(e.target.value as AgentProvider)}
          >
            <option value="anthropic">Anthropic</option>
            <option value="moonshot">Kimi (Moonshot)</option>
            <option value="wafer">Kimi (Wafer)</option>
            <option value="wafer-fast">Kimi Fast (Wafer)</option>
            <option value="deepseek">DeepSeek Flash</option>
            <option value="deepseek-pro">DeepSeek Pro</option>
          </select>
        </label>
      )}
      <label className="field">
        <span className="field-label">Shows as</span>
        <select
          className="field-input"
          value={shownAs}
          disabled={!canChat || needsLogin}
          onChange={(e) => onTransport(e.target.value as Transport)}
        >
          <option value="chat">Chat</option>
          <option value="terminal">Terminal</option>
        </select>
      </label>
      {needsLogin && (
        <div className="field-note">
          No Claude login is saved for sandboxes, so it runs in a terminal where you can log in with
          /login. To use chat, save one in Integrations → Vercel.
        </div>
      )}
      {!canChat && !host && (
        <div className="field-note">
          {cli === "codex" ? "Codex" : cli} has no chat view yet, so it runs in a terminal.
        </div>
      )}
    </div>
  );
}
