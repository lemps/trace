// Words, glyph names and choices for the composer's model-and-effort pill and its
// permission-mode picker (`AgentOptionPickers`). Pure, so `node:test` covers them.
// Values are Claude Code's own names (`--effort`, `--permission-mode`); Codex gets
// the subset its app-server takes, and its own top effort (`xhigh`). See
// agent_session/options in the backend.

import type { AgentOptions, SessionInfo } from "./types";

/** Claude Code's model aliases (`claude --help`); a full id works too. */
export const CLAUDE_MODEL_ALIASES = ["fable", "opus", "sonnet", "haiku"] as const;

export type OptionKind = "model" | "effort" | "permissionMode";

/** A model the installed Claude Code offers (`ipc/claudeModels`), as far as naming goes. */
export interface CatalogModel {
  value: string;
  displayName: string;
  /** The id an alias stands for: what a running agent reports for it. */
  resolvedModel?: string;
}

/**
 * Is `choice` the model in use? A running agent reports the id (`claude-opus-5-5`)
 * where the pick was the alias (`opus`), and they're one model.
 */
export function isModel(
  choice: string,
  current: string | undefined,
  catalog: readonly CatalogModel[]
): boolean {
  if (!current) return false;
  if (choice === current) return true;
  // Only when nothing is listed under the id itself, so that row is the one ticked.
  if (catalog.some((m) => m.value === current)) return false;
  return catalog.some((m) => m.value === choice && m.resolvedModel === current);
}

/**
 * The models to offer, plus the one in use: for Claude, what the installed CLI
 * lists (`catalog`), or its aliases until that's known; Codex only its own.
 */
export function modelChoices(
  agent: string,
  current: string | undefined,
  catalog: readonly CatalogModel[] = []
): string[] {
  const claude = catalog.length ? catalog.map((m) => m.value) : [...CLAUDE_MODEL_ALIASES];
  const list: string[] = agent === "claude" ? claude : [];
  const listed = list.some((m) => isModel(m, current, agent === "claude" ? catalog : []));
  if (current && !listed) list.push(current);
  return list;
}

/** A model's name: the CLI's own when it lists it ("Fable 5.1" for `fable`), else `modelLabel`. */
export function modelName(model: string | undefined, catalog: readonly CatalogModel[]): string {
  const listed = model
    ? (catalog.find((m) => m.value === model) ?? catalog.find((m) => m.resolvedModel === model))
    : undefined;
  return listed?.displayName ?? modelLabel(model);
}

const FAMILIES = "opus|sonnet|haiku|fable";
/** `claude-opus-5-5`, `claude-sonnet-4`: the family, then the version. */
const FAMILY_FIRST = new RegExp(`^claude-(${FAMILIES})-(\\d{1,2})(?:-(\\d{1,2}))?$`);
/** `claude-3-5-sonnet`, `claude-3-opus`: the older ids, version first. */
const VERSION_FIRST = new RegExp(`^claude-(\\d{1,2})(?:-(\\d{1,2}))?-(${FAMILIES})$`);
/** A release date (`-20261001`, or Vertex's `@20261001`). */
const DATE_STAMP = /[-@]\d{8}$/;
/** Claude Code's million-token context suffix (`opus[1m]`, `claude-sonnet-5-5[1m]`). */
const LONG_CONTEXT = /\[1m\]$/i;

/**
 * A model's name: Claude's aliases and ids read as "Opus", "Opus 5.5", "Sonnet 3.5",
 * "Opus 5.5 1M". Anything else (another provider's model, an id we don't know) is
 * shown exactly as it is: never a guess.
 */
export function modelLabel(model: string | undefined): string {
  if (!model) return "Default model";
  const name = anthropicName(model.replace(LONG_CONTEXT, ""));
  if (!name) return model;
  return LONG_CONTEXT.test(model) ? `${name} 1M` : name;
}

function anthropicName(id: string): string | null {
  if ((CLAUDE_MODEL_ALIASES as readonly string[]).includes(id)) return capitalise(id);
  const bare = id.replace(DATE_STAMP, "");
  const fresh = FAMILY_FIRST.exec(bare);
  if (fresh) return named(fresh[1], fresh[2], fresh[3]);
  const old = VERSION_FIRST.exec(bare);
  if (old) return named(old[3], old[1], old[2]);
  return null;
}

function named(family: string, major: string, minor: string | undefined): string {
  return `${capitalise(family)} ${minor === undefined ? major : `${major}.${minor}`}`;
}

/** The model and effort pill's two parts; `effort` is null while it's the default. */
export interface ModelEffortText {
  model: string;
  effort: string | null;
}

export function modelEffortText(
  model: string | undefined,
  effort: string | undefined,
  catalog: readonly CatalogModel[] = []
): ModelEffortText {
  return { model: modelName(model, catalog), effort: effort ? effortLabel(effort) : null };
}

/**
 * What follows the model in the pill: " · High", or nothing at the default effort
 * (the pill reads "Opus 5.5 · High" or "Opus 5.5"). Its own part, so a narrow
 * composer can drop it.
 */
export function effortSuffix({ effort }: ModelEffortText): string {
  return effort ? ` · ${effort}` : "";
}

/** The pill's accessible name: "Model and effort: Opus 5.5, High". */
export function modelEffortName({ model, effort }: ModelEffortText): string {
  return `Model and effort: ${model}, ${effort ?? effortLabel(undefined)}`;
}

/**
 * A picker's tooltip: its name and value (all a collapsed picker shows is a glyph),
 * then when a pick applies or why it can't be made.
 */
export function pickerTitle(name: string, notes: readonly (string | null)[]): string {
  return [name, ...notes.filter((n): n is string => Boolean(n))].join(". ");
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

/**
 * trace's own permission mode: the agent runs with Claude's checks bypassed and
 * every call routed back to trace, which answers it from the rules in Settings →
 * Permissions (`src-tauri/src/permissions`). Not one of Claude's
 * `--permission-mode` values — the backend turns it into the flag Claude takes.
 */
export const TRACE_MODE = "traceReview";

/**
 * Permission modes to offer. Codex has no plan mode here, and doesn't route its
 * approvals through trace's rules yet.
 */
export function modeChoices(agent: string): string[] {
  return agent === "codex"
    ? ["default", "acceptEdits", "bypassPermissions"]
    : ["default", "acceptEdits", "plan", TRACE_MODE, "bypassPermissions"];
}

const MODE_LABELS: Record<string, string> = {
  default: "Ask",
  acceptEdits: "Accept edits",
  plan: "Plan",
  [TRACE_MODE]: "Reviewed by trace",
  bypassPermissions: "Full access",
  dontAsk: "Don't ask",
  auto: "Auto",
};

const MODE_DETAILS: Record<string, string> = {
  default: "Asks before edits and commands",
  acceptEdits: "Edits files without asking; asks before commands",
  plan: "Reads and plans; changes nothing until you approve",
  [TRACE_MODE]: "trace checks each call against your rules; applies on next start",
  bypassPermissions: "Runs everything without asking",
};

export function modeLabel(mode: string | undefined): string {
  if (!mode) return "Default mode";
  return MODE_LABELS[mode] ?? mode;
}

export function modeDetail(mode: string): string | undefined {
  return MODE_DETAILS[mode];
}

/** The `I.*` glyph in front of a mode's word, by name (this module stays free of React). */
export type ModeGlyph =
  | "Hand"
  | "Pencil"
  | "Plan"
  | "ShieldAlert"
  | "Ban"
  | "ShieldCheck"
  | "Shield";

const MODE_GLYPHS = new Map<string, ModeGlyph>([
  ["default", "Hand"], // asks first: a raised hand
  ["acceptEdits", "Pencil"], // edits on its own: the edit glyph
  ["plan", "Plan"], // the Plan tab's own glyph: one glyph for "plan" app-wide
  [TRACE_MODE, "ShieldCheck"], // permissions checked for you, by trace
  ["bypassPermissions", "ShieldAlert"], // no permission checks at all
  ["dontAsk", "Ban"], // never asks: refuses whatever isn't allowed already
  ["auto", "ShieldCheck"], // permissions checked for you
]);

/** A mode's glyph; a plain shield (permissions) for an unset or unknown one. */
export function modeGlyph(mode: string | undefined): ModeGlyph {
  return (mode && MODE_GLYPHS.get(mode)) || "Shield";
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
