// One line per tool call: what it did, to what. Tool inputs are whatever Claude
// Code's tools take (and MCP tools name their own), so every field is read as
// `unknown` and narrowed — a tool we don't know still gets a sensible line.

/** How a tool call reads in the transcript. */
export interface ToolSummary {
  /** The tool's name as shown: `Bash`, `Edit`, `github · create_pr`. */
  label: string;
  /** What it acted on: a command, a pattern, a description. Empty when nothing says. */
  target: string;
  /** A file it read or changed, for the file link. */
  path: string | null;
  /** Shown in mono (commands, patterns, paths) rather than prose. */
  isCode: boolean;
}

type Fields = Record<string, unknown>;

function fields(input: unknown): Fields {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Fields) : {};
}

/** A string field, or "". */
export function str(input: unknown, key: string): string {
  const v = fields(input)[key];
  return typeof v === "string" ? v : "";
}

/** `mcp__github__create_pr` → `github · create_pr`. */
function toolLabel(name: string): string {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  return mcp ? `${mcp[1]} · ${mcp[2]}` : name;
}

/** The first short string in an input, for tools that name their arguments their own way. */
function firstShort(input: unknown): string {
  for (const v of Object.values(fields(input))) {
    if (typeof v === "string" && v.trim() && v.length <= 200) return v;
  }
  return "";
}

const FILE_TOOLS = new Set(["Read", "Edit", "MultiEdit", "Write", "NotebookEdit"]);

/** Summarise a call to `name` with `input`. */
export function summarize(name: string, input: unknown): ToolSummary {
  const label = toolLabel(name);
  if (FILE_TOOLS.has(name)) {
    const path = str(input, "file_path") || str(input, "notebook_path");
    return { label, target: path, path: path || null, isCode: true };
  }
  switch (name) {
    case "Bash":
    case "PowerShell": {
      const command = str(input, "command");
      const description = str(input, "description");
      return description
        ? { label, target: description, path: null, isCode: false }
        : { label, target: firstLine(command), path: null, isCode: true };
    }
    case "Grep":
    case "Glob": {
      const where = str(input, "path");
      const target = [str(input, "pattern"), where && `in ${where}`].filter(Boolean).join(" ");
      return { label, target, path: null, isCode: true };
    }
    case "WebFetch":
      return { label, target: str(input, "url"), path: null, isCode: true };
    case "WebSearch":
      return { label, target: str(input, "query"), path: null, isCode: false };
    case "Task":
    case "Agent": {
      const kind = str(input, "subagent_type");
      const target = [str(input, "description"), kind && `(${kind})`].filter(Boolean).join(" ");
      return { label: "Agent", target, path: null, isCode: false };
    }
    case "TodoWrite":
      return { label: "Todos", target: todoProgress(input), path: null, isCode: false };
    case "Skill":
      return { label, target: str(input, "skill"), path: null, isCode: true };
    default: {
      const target = str(input, "description") || str(input, "prompt") || firstShort(input);
      return { label, target: firstLine(target), path: null, isCode: false };
    }
  }
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length < text.trim().length ? `${line} …` : line;
}

/** One `TodoWrite` entry. */
export interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

/** A `TodoWrite` call's list, dropping entries that aren't todo-shaped. */
export function todosOf(input: unknown): Todo[] {
  const list = fields(input).todos;
  if (!Array.isArray(list)) return [];
  return list.flatMap((t): Todo[] => {
    const content = str(t, "content");
    const status = str(t, "status");
    if (!content) return [];
    const known = status === "in_progress" || status === "completed" ? status : "pending";
    return [{ content, status: known }];
  });
}

function todoProgress(input: unknown): string {
  const todos = todosOf(input);
  if (todos.length === 0) return "";
  const done = todos.filter((t) => t.status === "completed").length;
  return `${done} of ${todos.length} done`;
}

/** The workspace-relative form of `path`, when it sits under `root`. */
export function relativeTo(path: string, root: string | null): string {
  if (!root) return path;
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const p = norm(path);
  const r = norm(root);
  const under = p.toLowerCase().startsWith(`${r.toLowerCase()}/`);
  return under ? p.slice(r.length + 1) : path;
}
