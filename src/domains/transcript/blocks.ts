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

/**
 * When the turn in progress started (unix ms): the first prompt after the last
 * turn end. Null between turns, or when that prompt carries no time.
 */
export function turnStartedAt(items: readonly TranscriptItem[]): number | null {
  let at: string | null = null;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "turnEnd") break;
    if (item.kind === "prompt") at = item.at;
  }
  const ms = at ? Date.parse(at) : Number.NaN;
  return Number.isNaN(ms) ? null : ms;
}
