import type { AgentCli, AgentProvider } from "@/ipc/agent";

/**
 * The one table of agent names. A third-party-backed claude reads as the model
 * it actually runs ("Kimi (Wafer)"), so mixed rosters stay distinguishable;
 * buttons, toasts, tabs and the Start menu all build their words from here.
 */
const PROVIDER_NAMES: Record<AgentProvider, string> = {
  anthropic: "Claude",
  moonshot: "Kimi (Moonshot)",
  wafer: "Kimi (Wafer)",
  "wafer-fast": "Kimi Fast (Wafer)",
  deepseek: "DeepSeek Flash",
  "deepseek-pro": "DeepSeek Pro",
};

const CLI_NAMES: Record<AgentCli, string> = {
  claude: "Claude",
  codex: "Codex",
};

/** Display name for a launched agent: "Claude", "Codex", "Kimi (Wafer)", … */
export function agentLabel(cli: AgentCli, provider?: AgentProvider | null): string {
  if (cli !== "claude") return CLI_NAMES[cli];
  return PROVIDER_NAMES[provider ?? "anthropic"] ?? CLI_NAMES.claude;
}

/**
 * The longer name a launch menu shows, which also says the harness:
 * "Claude · Kimi (Wafer)". Plain Claude and Codex are just their names.
 */
export function agentMenuLabel(cli: AgentCli, provider: AgentProvider): string {
  const name = agentLabel(cli, provider);
  return cli === "claude" && provider !== "anthropic" ? `${CLI_NAMES.claude} · ${name}` : name;
}
