import { I } from "@/components/Icon";
import { PopMenu } from "@/components/PopMenu";
import { defaultTransport, useHasChat } from "@/domains/agentChat/transport";
import type { AgentCli, AgentProvider, Transport } from "@/ipc/agent";
import { AGENT_OPTIONS, isChosen } from "./agentOptions";
import { agentLabel } from "./providerLabel";

interface StartSplitButtonProps {
  cli: AgentCli;
  provider: AgentProvider;
  onStart: () => void;
  onChoose: (cli: AgentCli, provider: AgentProvider) => void;
  /** Chat or terminal for this start; undefined = what it ran on last, else Settings' default. */
  transport: Transport | undefined;
  onChooseTransport: (transport: Transport) => void;
}

// "Start Claude ▾": one click starts the chosen agent; the caret picks which
// (CLI + model provider), and whether it shows as a chat or a terminal —
// replacing the selects that sat beside Start.
export function StartSplitButton({
  cli,
  provider,
  onStart,
  onChoose,
  transport,
  onChooseTransport,
}: StartSplitButtonProps) {
  const canChat = useHasChat(cli);
  const shown = canChat ? (transport ?? defaultTransport(cli)) : "terminal";
  return (
    <div className="split-btn">
      <button type="button" className="btn primary" onClick={onStart}>
        <I.Bolt size={13} /> Start {agentLabel(cli, provider)}
      </button>
      <PopMenu
        trigger={({ toggle }) => (
          <button
            type="button"
            className="btn primary"
            onClick={toggle}
            title="Choose which agent to start"
            aria-label="Choose which agent to start"
          >
            <span className="caret">
              <I.Chevron size={12} />
            </span>
          </button>
        )}
        sections={[
          {
            title: "Agent",
            items: AGENT_OPTIONS.map((o) => ({
              label: o.label,
              checked: isChosen(o, cli, provider),
              onSelect: () => onChoose(o.cli, o.provider),
            })),
          },
          {
            title: "Shows as",
            items: [
              {
                label: canChat ? "Chat" : `Chat (not available for ${agentLabel(cli, provider)})`,
                checked: shown === "chat",
                disabled: !canChat,
                onSelect: () => onChooseTransport("chat"),
              },
              {
                label: "Terminal",
                checked: shown === "terminal",
                onSelect: () => onChooseTransport("terminal"),
              },
            ],
          },
        ]}
      />
    </div>
  );
}
