import type { AgentCli, AgentProvider } from "@/ipc/agent";
import { agentMenuLabel } from "./providerLabel";

/** One launchable agent: a CLI and (for Claude) the model provider behind it. */
export interface AgentOption {
  cli: AgentCli;
  provider: AgentProvider;
  label: string;
}

/**
 * Every agent trace can launch, in menu order. Shared by the ticket header's
 * split Start button and a session's "+ agent" menu so the two never drift;
 * the words come from providerLabel's one table.
 */
const LAUNCHABLE: [AgentCli, AgentProvider][] = [
  ["claude", "anthropic"],
  ["claude", "moonshot"],
  ["claude", "wafer"],
  ["claude", "wafer-fast"],
  ["claude", "deepseek"],
  ["claude", "deepseek-pro"],
  ["codex", "anthropic"],
];

export const AGENT_OPTIONS: AgentOption[] = LAUNCHABLE.map(([cli, provider]) => ({
  cli,
  provider,
  label: agentMenuLabel(cli, provider),
}));

/** Whether an option is the current cli+provider pick (codex has no provider). */
export function isChosen(o: AgentOption, cli: AgentCli, provider: AgentProvider): boolean {
  return o.cli === cli && (cli === "codex" || o.provider === provider);
}
