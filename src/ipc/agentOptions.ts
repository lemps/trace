import { invoke } from "@tauri-apps/api/core";
import type { OptionKind } from "@/domains/agentChat/agentOptionsFormat";
import type { AgentOptions } from "@/domains/agentChat/types";

// Typed wrappers around `commands/agent_options.rs`: a workspace's model, effort
// and permission mode, picked in the chat composer.

export interface SetAgentOptionResult {
  /** Everything now saved for the workspace. */
  options: AgentOptions;
  /** The running agent took it at once; otherwise it applies on its next start. */
  live: boolean;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Only the known fields, as strings: the IPC payload isn't trusted as typed. */
function parseOptions(raw: unknown): AgentOptions {
  if (typeof raw !== "object" || raw === null) return {};
  const o = raw as Record<string, unknown>;
  const out: AgentOptions = {};
  const model = str(o.model);
  const effort = str(o.effort);
  const permissionMode = str(o.permissionMode);
  if (model) out.model = model;
  if (effort) out.effort = effort;
  if (permissionMode) out.permissionMode = permissionMode;
  return out;
}

/** The options picked for a workspace (empty when none were). */
export async function agentOptions(workspaceId: string): Promise<AgentOptions> {
  return parseOptions(await invoke("agent_options", { workspaceId }));
}

/**
 * Pick one of a workspace's options: saved for every start, and sent to its
 * running chat agent where its CLI can switch mid-session.
 */
export async function setAgentOption(
  workspaceId: string,
  kind: OptionKind,
  value: string
): Promise<SetAgentOptionResult> {
  const raw: unknown = await invoke("set_agent_option", { workspaceId, kind, value });
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { options: parseOptions(r.options), live: r.live === true };
}
