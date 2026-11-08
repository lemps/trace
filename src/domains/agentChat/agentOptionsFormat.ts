// Words and choices for the composer's model, effort and mode pickers. Pure, so
// `node:test` covers them. Values are Claude Code's own names (`--effort`,
// `--permission-mode`); Codex gets the subset its app-server takes, and its own
// top effort (`xhigh`). See agent_session/options in the backend.

import type { AgentOptions, SessionInfo } from "./types";

/** Claude Code's model aliases (`claude --help`); a full id works too. */
export const CLAUDE_MODEL_ALIASES = ["fable", "opus", "sonnet", "haiku"] as const;

export type OptionKind = "model" | "effort" | "permissionMode";

/** The models to offer: Claude's aliases plus the id in use; Codex only its own. */
export function modelChoices(agent: string, current: string | undefined): string[] {
  const list: string[] = agent === "claude" ? [...CLAUDE_MODEL_ALIASES] : [];
  if (current && !list.includes(current)) list.push(current);
  return list;
}

export function modelLabel(model: string | undefined): string {
  if (!model) return "Default model";
  return (CLAUDE_MODEL_ALIASES as readonly string[]).includes(model) ? capitalise(model) : model;
}

/** Effort levels to offer, lowest first. */
export function effortChoices(agent: string): string[] {
  return agent === "codex" ? ["low", "medium", "high", "xhigh"] : ["low", "medium", "high", "max"];
}

const EFFORT_LABELS: Record<string, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

export function effortLabel(effort: string | undefined): string {
  if (!effort) return "Default effort";
  return EFFORT_LABELS[effort] ?? effort;
}

/** Permission modes to offer. Codex has no plan mode here. */
export function modeChoices(agent: string): string[] {
  return agent === "codex"
    ? ["default", "acceptEdits", "bypassPermissions"]
    : ["default", "acceptEdits", "plan", "bypassPermissions"];
}

const MODE_LABELS: Record<string, string> = {
  default: "Ask",
  acceptEdits: "Accept edits",
  plan: "Plan",
  bypassPermissions: "Full access",
  dontAsk: "Don't ask",
  auto: "Auto",
};

const MODE_DETAILS: Record<string, string> = {
  default: "Asks before edits and commands",
  acceptEdits: "Edits files without asking; asks before commands",
  plan: "Reads and plans; changes nothing until you approve",
  bypassPermissions: "Runs everything without asking",
};

export function modeLabel(mode: string | undefined): string {
  if (!mode) return "Default mode";
  return MODE_LABELS[mode] ?? mode;
}

export function modeDetail(mode: string): string | undefined {
  return MODE_DETAILS[mode];
}

/**
 * What a picker shows: while the agent runs, what it reports (what's actually in
 * effect), else what was picked; while it's stopped, what its next start uses.
 */
export function shownOption(
  kind: OptionKind,
  running: boolean,
  info: SessionInfo | undefined,
  saved: AgentOptions | undefined
): string | undefined {
  const reported = info?.[kind];
  const picked = saved?.[kind];
  return running ? (reported ?? picked) : picked;
}

/**
 * When a pick takes effect, for the picker's tooltip: null when it's at once.
 * Claude switches all three live; Codex from its next message; a stopped agent
 * on its next start.
 */
export function appliesWhen(running: boolean, agent: string): string | null {
  if (!running) return "Applies on next start";
  if (agent === "codex") return "Applies from the next message";
  return null;
}

/** Why the model can't be picked, or null when it can. */
export function modelLockReason(agent: string, provider: string | undefined): string | null {
  if (provider && provider !== "anthropic") return `The ${provider} provider sets the model`;
  if (agent !== "claude") return "Set Codex's model with -m in Settings → Agents";
  return null;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
