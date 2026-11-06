import type { TranscriptItem } from "@/ipc/transcript";

// The transcript's items, arranged for reading: each tool call paired with its
// result, and a run of consecutive calls folded into one group so a turn that
// read twenty files is one block, not twenty.

type Item<K extends TranscriptItem["kind"]> = Extract<TranscriptItem, { kind: K }>;

/** A tool call and, once it returned, its result. */
export interface ToolStep {
  call: Item<"toolCall">;
  result: Item<"toolResult"> | null;
}

export type Block =
  | { type: "prompt"; item: Item<"prompt"> }
  | { type: "reply"; item: Item<"reply"> }
  | { type: "command"; item: Item<"command"> }
  | { type: "notice"; item: Item<"notice"> }
  | { type: "turnEnd"; item: Item<"turnEnd"> }
  | { type: "tools"; id: string; steps: ToolStep[] };

/** Arrange items into blocks. Pure, so it re-runs cheaply on every new read. */
export function toBlocks(items: readonly TranscriptItem[]): Block[] {
  const results = new Map<string, Item<"toolResult">>();
  for (const item of items) if (item.kind === "toolResult") results.set(item.toolUseId, item);

  const blocks: Block[] = [];
  for (const item of items) {
    switch (item.kind) {
      case "toolResult":
        break; // Shown with its call.
      case "toolCall": {
        const step = { call: item, result: results.get(item.toolUseId) ?? null };
        const last = blocks[blocks.length - 1];
        if (last?.type === "tools") last.steps.push(step);
        else blocks.push({ type: "tools", id: item.id, steps: [step] });
        break;
      }
      case "prompt":
        blocks.push({ type: "prompt", item });
        break;
      case "reply":
        blocks.push({ type: "reply", item });
        break;
      case "command":
        blocks.push({ type: "command", item });
        break;
      case "notice":
        blocks.push({ type: "notice", item });
        break;
      case "turnEnd":
        blocks.push({ type: "turnEnd", item });
        break;
    }
  }
  return blocks;
}

/** "4s", "1m 30s", "2h 5m" — how long a turn took. */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** Verb phrases per tool, singular and plural, for a run's one-line summary. */
const RUN_PHRASES: Record<string, [string, string, string]> = {
  Read: ["read", "file", "files"],
  Edit: ["edited", "file", "files"],
  MultiEdit: ["edited", "file", "files"],
  Write: ["wrote", "file", "files"],
  Bash: ["ran", "command", "commands"],
  PowerShell: ["ran", "command", "commands"],
  Grep: ["searched", "time", "times"],
  Glob: ["searched", "time", "times"],
  WebFetch: ["fetched", "page", "pages"],
  WebSearch: ["searched the web", "time", "times"],
  Task: ["started", "agent", "agents"],
  Agent: ["started", "agent", "agents"],
};

/**
 * "Read 3 files, ran 2 commands and edited a file": what a run of tool calls did,
 * in first-use order, so a folded run still says what happened inside it.
 */
export function runSentence(steps: readonly ToolStep[]): string {
  const counts = new Map<string, { phrase: [string, string, string]; n: number }>();
  for (const { call } of steps) {
    const phrase = RUN_PHRASES[call.name] ?? ["used", "tool", "tools"];
    // Same verb + noun merge (Edit and MultiEdit are both "edited N files").
    const key = `${phrase[0]} ${phrase[2]}`;
    const entry = counts.get(key);
    if (entry) entry.n++;
    else counts.set(key, { phrase, n: 1 });
  }
  const parts = [...counts.values()].map(({ phrase: [verb, one, many], n }) => {
    if (one === "time") return n === 1 ? verb : `${verb} ${n} times`;
    return n === 1 ? `${verb} ${one === "agent" ? "an" : "a"} ${one}` : `${verb} ${n} ${many}`;
  });
  const text =
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}
