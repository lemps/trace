import type { ChatItem } from "./projection.ts";
import { patchFiles, patchOf, summarizeTool, type ToolCategory } from "./toolSummary.ts";
import type { TurnState, Usage } from "./types.ts";

// Words and numbers for the chat: durations, token counts, cost, usage-limit
// windows, the sentence a folded turn shows in place of its work and the line a
// turn ends on. The transcript uses the same words.

/** "4s", "1m 30s", "2h 5m". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** 950 → "950", 12_345 → "12.3k", 2_100_000 → "2.1M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** "$0.04", "<$0.01". */
export function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

/** A turn's usage as short facts: "12.3k in", "2.1k out", "40k cached", "$0.04". */
export function usageFacts(usage: Usage): string[] {
  const facts = [
    `${formatTokens(usage.inputTokens)} in`,
    `${formatTokens(usage.outputTokens)} out`,
  ];
  if (usage.cacheReadTokens > 0) facts.push(`${formatTokens(usage.cacheReadTokens)} cached`);
  if (usage.costUsd !== undefined) facts.push(formatCost(usage.costUsd));
  return facts;
}

/** `five_hour` → "5-hour", `seven_day_opus` → "7-day Opus". */
export function limitLabel(name: string): string {
  const numbers: Record<string, string> = { one: "1", five: "5", seven: "7", thirty: "30" };
  const parts = name.split(/[_\s-]+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const n = numbers[parts[i].toLowerCase()];
    const unit = parts[i + 1];
    if (n && unit) {
      out.push(`${n}-${unit.toLowerCase()}`);
      i++;
    } else {
      out.push(parts[i].charAt(0).toUpperCase() + parts[i].slice(1));
    }
  }
  return out.join(" ") || name;
}

/** How long until `resetsAt` (unix seconds): "in 2h 5m", or "" when unknown or past. */
export function resetsIn(resetsAt: number | undefined, nowMs: number): string {
  if (!resetsAt) return "";
  const ms = resetsAt * 1000 - nowMs;
  if (ms <= 0) return "";
  const m = Math.round(ms / 60_000);
  if (m < 60 * 24) return `in ${formatDuration(m * 60_000)}`;
  return `in ${Math.round(m / 60 / 24)}d`;
}

const PHRASES: Record<ToolCategory, [string, string]> = {
  run: ["ran", "command"],
  read: ["read", "file"],
  edit: ["edited", "file"],
  search: ["searched", "time"],
  web: ["fetched", "page"],
  agent: ["started", "agent"],
  plan: ["updated", "task list"],
  other: ["used", "tool"],
};

/** Calls counted by kind; edited files once however many calls and diffs touched them. */
class Tally {
  readonly counts = new Map<ToolCategory, number>();
  private readonly edited = new Set<string>();

  bump(c: ToolCategory) {
    this.counts.set(c, (this.counts.get(c) ?? 0) + 1);
  }

  touch(path: string) {
    this.edited.add(path.replace(/\\/g, "/").toLowerCase());
  }

  call(name: string, input: unknown) {
    const line = summarizeTool(name, input);
    if (line.category !== "edit") this.bump(line.category);
    else if (name === "apply_patch") {
      for (const f of patchFiles(patchOf(input))) this.touch(f);
    } else if (line.path) this.touch(line.path);
  }

  /** "ran 3 commands", "read 4 files", … in first-use order. */
  parts(): string[] {
    if (this.edited.size > 0) this.counts.set("edit", this.edited.size);
    return [...this.counts].map(([c, n]) => {
      const [verb, noun] = PHRASES[c];
      if (c === "search") return n === 1 ? "searched" : `searched ${n} times`;
      if (c === "plan") return "updated the tasks";
      return `${verb} ${n} ${noun}${n === 1 ? "" : "s"}`;
    });
  }
}

/** "a, b and c", capitalised. */
function sentence(parts: readonly string[]): string {
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** "Ran 3 commands, read 4 files and edited 2 files": what a folded turn did. */
export function workSentence(items: readonly ChatItem[]): string {
  const tally = new Tally();
  let thoughts = 0;
  let notes = 0;
  for (const item of items) {
    if (item.type === "tool") {
      tally.call(item.call.name, item.call.input);
      for (const d of item.diffs) tally.touch(d.diff.path);
    } else if (item.type === "diff") tally.touch(item.diff.path);
    else if (item.type === "plan") tally.bump("plan");
    else if (item.type === "message" && item.message.role === "reasoning") thoughts++;
    else if (item.type === "message") notes++;
  }
  const parts = tally.parts();
  if (parts.length === 0) {
    if (notes > 0) parts.push(`${notes} message${notes === 1 ? "" : "s"}`);
    else if (thoughts > 0) parts.push("thought it through");
  }
  return parts.length === 0 ? "Worked" : sentence(parts);
}

/** The same sentence for a run of bare calls (the transcript's folded tool runs). */
export function callsSentence(calls: readonly { name: string; input: unknown }[]): string {
  const tally = new Tally();
  for (const c of calls) tally.call(c.name, c.input);
  const parts = tally.parts();
  return parts.length === 0 ? "" : sentence(parts);
}

const ENDED: Record<TurnState, string> = {
  running: "Worked",
  completed: "Worked",
  interrupted: "Interrupted after",
  failed: "Failed after",
};

/** "Worked 3m 12s · 64.9k in · 5.9k out · 212k cached · $0.41": the line a turn ends on. */
export function turnEndText(state: TurnState, durationMs?: number, usage?: Usage): string {
  const word = ENDED[state];
  const facts = [
    durationMs !== undefined
      ? `${word} ${formatDuration(durationMs)}`
      : word.replace(/ after$/, ""),
  ];
  if (usage) facts.push(...usageFacts(usage));
  return facts.join(" · ");
}

/** How many of a folded turn's tool calls failed, for its "N failed" mark. */
export function failedCount(items: readonly ChatItem[]): number {
  return items.filter((i) => i.type === "tool" && i.call.state === "failed").length;
}
