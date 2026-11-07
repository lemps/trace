// One line per tool call, the same for every agent brand: Claude's `Bash` and
// Codex's `shell` both read "Run <command>". Inputs are whatever each agent's
// tools take, so every field is read as `unknown` and narrowed; a tool we don't
// know still gets its name and a short form of its input.

/** What kind of work a call is, for a folded turn's sentence ("ran 3 commands"). */
export type ToolCategory = "run" | "read" | "edit" | "search" | "web" | "agent" | "plan" | "other";

export interface ToolLine {
  /** A short verb-like label: Run, Read, Edit, Search, `github · create_pr`. */
  label: string;
  /** What it acted on: a command, a pattern, a description. Empty when nothing says. */
  target: string;
  /** A file it read or changed, for the file link. */
  path: string | null;
  /** Shown in mono (commands, patterns, paths) rather than prose. */
  isCode: boolean;
  category: ToolCategory;
}

type Fields = Record<string, unknown>;

export function fields(input: unknown): Fields {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Fields) : {};
}

/** A string field, or "". */
export function str(input: unknown, key: string): string {
  const v = fields(input)[key];
  return typeof v === "string" ? v : "";
}

/** The first line of `text`, marked when there was more. */
export function firstLine(text: string): string {
  const t = text.trim();
  const line = t.split("\n")[0] ?? "";
  return line.length < t.length ? `${line} …` : line;
}

const INPUT_CHARS = 160;

/** A one-line form of any input, for tools we don't know. */
export function compactInput(input: unknown): string {
  if (input === undefined || input === null) return "";
  if (typeof input === "string") return firstLine(input);
  const f = fields(input);
  for (const key of ["description", "prompt", "query", "path", "url", "command", "name"]) {
    const v = f[key];
    if (typeof v === "string" && v.trim()) return firstLine(v);
  }
  let json: string;
  try {
    json = JSON.stringify(input) ?? "";
  } catch {
    return "";
  }
  if (json === "{}" || json === "[]") return "";
  return json.length > INPUT_CHARS ? `${json.slice(0, INPUT_CHARS)}…` : json;
}

/** A command given as a string or an argv list; `bash -lc "…"` unwrapped to the script. */
export function commandOf(input: unknown): string {
  const f = fields(input);
  const raw = f.command ?? f.cmd;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.every((a) => typeof a === "string")) {
    const argv = raw as string[];
    const shell = /(^|[\\/])(ba|z)?sh(\.exe)?$|powershell|pwsh/i;
    if (argv.length === 3 && shell.test(argv[0]) && /^-(l?c|Command)$/i.test(argv[1])) {
      return argv[2];
    }
    return argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ");
  }
  return "";
}

/** The files an `apply_patch` call touches, from its `*** Update File: …` headers. */
export function patchFiles(patch: string): string[] {
  const files: string[] = [];
  for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) {
    files.push(m[1].trim());
  }
  return files;
}

/** The patch text of an `apply_patch` call, however it's passed. */
export function patchOf(input: unknown): string {
  if (typeof input === "string") return input;
  return str(input, "input") || str(input, "patch");
}

/** `mcp__github__create_pr` → `github · create_pr`. */
function mcpLabel(name: string): string | null {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  return mcp ? `${mcp[1]} · ${mcp[2]}` : null;
}

const line = (
  label: string,
  target: string,
  category: ToolCategory,
  isCode = true,
  path: string | null = null
): ToolLine => ({ label, target, path, isCode, category });

/** Summarise a call to `name` with `input`. */
export function summarizeTool(name: string, input: unknown): ToolLine {
  switch (name) {
    case "Bash":
    case "PowerShell":
    case "shell":
    case "local_shell":
    case "exec_command":
    case "unified_exec": {
      const description = str(input, "description");
      if (description) return line("Run", description, "run", false);
      return line("Run", firstLine(commandOf(input)), "run");
    }
    case "Read":
    case "read_file":
    case "view_image": {
      const path = str(input, "file_path") || str(input, "path");
      return line("Read", path, "read", true, path || null);
    }
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit": {
      const path = str(input, "file_path") || str(input, "notebook_path");
      return line("Edit", path, "edit", true, path || null);
    }
    case "Write": {
      const path = str(input, "file_path");
      return line("Write", path, "edit", true, path || null);
    }
    case "apply_patch": {
      const files = patchFiles(patchOf(input));
      const target = files.length > 1 ? `${files.length} files` : (files[0] ?? "");
      return line("Patch", target, "edit", true, files.length === 1 ? files[0] : null);
    }
    case "Grep":
    case "grep_files": {
      const where = str(input, "path") || str(input, "glob");
      const target = [str(input, "pattern"), where && `in ${where}`].filter(Boolean).join(" ");
      return line("Search", target, "search");
    }
    case "Glob":
    case "list_dir": {
      const where = str(input, "path");
      const pattern = str(input, "pattern");
      const target = pattern ? [pattern, where && `in ${where}`].filter(Boolean).join(" ") : where;
      return line(name === "Glob" ? "Find" : "List", target, "search");
    }
    case "WebFetch":
      return line("Fetch", str(input, "url"), "web");
    case "WebSearch":
    case "web_search":
      return line("Web search", str(input, "query"), "web", false);
    case "Task":
    case "Agent": {
      const kind = str(input, "subagent_type");
      const target = [str(input, "description"), kind && `(${kind})`].filter(Boolean).join(" ");
      return line("Agent", target, "agent", false);
    }
    case "TodoWrite":
    case "update_plan":
      return line("Plan", "", "plan", false);
    case "Skill":
      return line("Skill", str(input, "skill"), "other");
    default: {
      const label = mcpLabel(name) ?? name;
      return line(label, compactInput(input), "other", false);
    }
  }
}
