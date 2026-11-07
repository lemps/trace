import type { ChatItem, ToolItem } from "./projection.ts";
import { firstLine, str, summarizeTool } from "./toolSummary.ts";
import type { JournalRow } from "./types.ts";

// A subagent's own conversation, gathered from the journal: the call that
// started it (Claude's Task/Agent, Codex's spawn_agent) and every row naming that
// call as `parentCallId`. The main timeline shows one card per subagent in
// place of its rows; a tab shows its rows in full. See docs/AGENT_CHAT.md.

export type SubagentStatus = "running" | "done" | "failed" | "stopped";

export interface SubagentThread {
  callId: string;
  /** The call that started it (its card in the main timeline). */
  call: ToolItem;
  /** What it was asked to do: "find the auth code". */
  label: string;
  agentType: string | null;
  description: string | null;
  /** What it was asked to do. */
  brief: string;
  status: SubagentStatus;
  background: boolean;
  /** When its call arrived (unix ms). */
  startedAt: number;
  /** How long it ran, once the agent says. */
  durationMs: number | null;
  toolCount: number;
  /** Its latest step, one line. */
  activity: string;
  /** Its final report, once done. */
  result: string | null;
  /** Its own messages and calls, in order. A nested subagent is a call here. */
  items: ChatItem[];
  /** One of its calls waits on a permission answer. */
  pending: boolean;
  /** The subagent that started this one, if any. */
  parentCallId: string | null;
  /** Grows whenever any of its rows change. */
  version: number;
}

/** Tools that start a subagent, by name, for journals from before `subagent` was set. */
const LAUNCHERS = new Set(["Task", "Agent", "spawn_agent"]);

/** Whether a tool row starts a subagent: it says so, it's named like one, or rows name it. */
export function isLauncher(row: JournalRow, parents: ReadonlySet<string>): boolean {
  const b = row.body;
  if (b.kind !== "tool") return false;
  return b.subagent !== undefined || LAUNCHERS.has(b.name) || parents.has(b.callId);
}

/** The call ids rows name as their subagent. */
export function parentIds(rows: readonly JournalRow[]): Set<string> {
  const out = new Set<string>();
  for (const { body } of rows) {
    if ((body.kind === "tool" || body.kind === "message") && body.parentCallId) {
      out.add(body.parentCallId);
    }
  }
  return out;
}

export function newThread(call: ToolItem): SubagentThread {
  return {
    callId: call.call.callId,
    call,
    label: "",
    agentType: null,
    description: null,
    brief: "",
    status: "running",
    background: false,
    startedAt: call.row.at,
    durationMs: null,
    toolCount: 0,
    activity: "",
    result: null,
    items: [],
    pending: false,
    parentCallId: call.call.parentCallId ?? null,
    version: call.version,
  };
}

const STATUS: Record<string, SubagentStatus> = {
  running: "running",
  completed: "done",
  failed: "failed",
  stopped: "stopped",
};

/** Fill in what's derived once all of a subagent's rows are in. */
export function finishThread(t: SubagentThread, isPending: (i: ChatItem) => boolean): void {
  const { call } = t.call;
  const s = call.subagent;
  t.agentType = s?.agentType ?? (str(call.input, "subagent_type") || null);
  t.description = s?.description ?? (str(call.input, "description") || null);
  t.brief = str(call.input, "prompt");
  // The task leads: the type ("general-purpose") is long and says little, so it's
  // shown beside the label (view header, tooltips), not in it.
  t.label = t.description ?? (firstLine(t.brief) || t.agentType || "Subagent");
  t.status = STATUS[s?.state ?? call.state] ?? "running";
  t.background = s?.background ?? false;
  t.durationMs = s?.durationMs ?? null;
  const calls = t.items.filter((i) => i.type === "tool").length;
  t.toolCount = Math.max(calls, s?.toolUses ?? 0);
  t.pending = t.items.some(isPending);
  const said = lastWords(t.items);
  t.result = s?.result ?? (t.status === "done" ? (said ?? (call.output?.trim() || null)) : null);
  t.activity = latestStep(t.items) ?? s?.activity ?? (t.status === "running" ? "Starting…" : "");
}

/** The subagent's last message, if it said anything. */
function lastWords(items: readonly ChatItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === "message" && item.message.role === "assistant" && item.message.text.trim()) {
      return item.message.text.trim();
    }
  }
  return null;
}

/** Its newest call or message, as one line. */
function latestStep(items: readonly ChatItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === "tool") {
      const line = summarizeTool(item.call.name, item.call.input);
      const target = line.path ?? line.target;
      return target ? `${line.label} ${firstLine(target)}` : line.label;
    }
    if (item.type === "message" && item.message.role === "assistant" && item.message.text.trim()) {
      return firstLine(item.message.text);
    }
  }
  return null;
}
