import { formatTokens } from "./format.ts";
import type { ContextUsage } from "./types.ts";

// Words and numbers for the chat header's context gauge (`ContextGauge`).

/** From here the gauge turns red: the agent is about to compact. */
export const CONTEXT_DANGER = 90;
/** From here the tooltip says compaction is automatic. */
export const CONTEXT_NEAR_FULL = 80;

/** How full, 0–100, rounded. */
export function contextPercent({ used, window }: ContextUsage): number {
  if (window <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, used / window)) * 100);
}

/** "34%", or "<1%" for a context that holds something but rounds to nothing. */
export function contextLabel(c: ContextUsage): string {
  const pct = contextPercent(c);
  return pct === 0 && c.used > 0 ? "<1%" : `${pct}%`;
}

/** The agent's own name for itself, for "… compacts automatically". */
function harness(agent: string | undefined): string {
  if (agent === "claude") return "Claude Code";
  if (agent === "codex") return "Codex";
  return "The agent";
}

/** "Context: 340k of 1M tokens used", with what an estimate and a full context mean. */
export function contextTitle(c: ContextUsage, agent?: string): string {
  const lines = [`Context: ${formatTokens(c.used)} of ${formatTokens(c.window)} tokens used`];
  if (c.estimated) lines.push("The window size is estimated from the model.");
  if (contextPercent(c) >= CONTEXT_NEAR_FULL) {
    lines.push(`${harness(agent)} compacts the conversation automatically when it fills.`);
  }
  return lines.join("\n");
}
