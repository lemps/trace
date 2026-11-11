import { invoke } from "@tauri-apps/api/core";

// Typed wrapper around `claude_catalog` (commands/agent_options.rs): the models and
// slash commands the installed Claude Code offers, asked of the CLI so new ones
// show up by themselves.

export interface ClaudeModel {
  /** What `--model` takes: an alias (`opus`) or a full id (`claude-fable-5-2`). */
  value: string;
  /** The CLI's own name for it ("Opus 5.5"). */
  displayName: string;
  description: string;
  /** The id an alias stands for (`opus` → `claude-opus-5-5`): what a running agent reports. */
  resolvedModel: string;
}

export interface ClaudeCommand {
  /** Without its slash: `compact`, `code-review`. */
  name: string;
  description: string;
  /** What it takes after its name ("[instructions]"), or empty. */
  argumentHint: string;
}

export interface ClaudeCatalog {
  models: ClaudeModel[];
  commands: ClaudeCommand[];
}

type Fields = Record<string, unknown>;

const str = (o: Fields, key: string) => (typeof o[key] === "string" ? (o[key] as string) : "");

function list<T>(raw: unknown, parse: (o: Fields) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => (typeof v === "object" && v !== null ? parse(v as Fields) : null))
    .filter((v): v is T => v !== null);
}

function parseModel(o: Fields): ClaudeModel | null {
  const value = str(o, "value");
  if (!value) return null;
  return {
    value,
    displayName: str(o, "displayName") || value,
    description: str(o, "description"),
    resolvedModel: str(o, "resolvedModel") || value,
  };
}

function parseCommand(o: Fields): ClaudeCommand | null {
  const name = str(o, "name").replace(/^\//, "");
  if (!name) return null;
  return { name, description: str(o, "description"), argumentHint: str(o, "argumentHint") };
}

/** What the installed Claude Code offers, in its own order (model "default" left out). */
export async function claudeCatalog(): Promise<ClaudeCatalog> {
  const raw: unknown = await invoke("claude_catalog");
  const o: Fields = typeof raw === "object" && raw !== null ? (raw as Fields) : {};
  return { models: list(o.models, parseModel), commands: list(o.commands, parseCommand) };
}
