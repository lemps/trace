import type { AgentLight } from "./types.ts";

// "No recent update": a live agent whose light still says Working but that
// trace hasn't heard from in a while — no terminal output, no hook, no chat
// event. Not a fifth state (it still counts, sorts and filters as working);
// a fifth *look*, a still dashed ring in grey, which is more honest than a
// spinner that may be stale. The pure half lives here; `quietStore.ts` tracks
// when each agent was last heard from.

/**
 * How long a working agent may go unheard before it reads "No recent update".
 * A terminal agent's TUI animates the whole time it works, and a chat agent
 * reports every step, so silence this long is rare: it outlasts Claude Code's
 * longest Bash timeout (10 minutes), so one slow command can't trip it alone.
 */
export const QUIET_AFTER_MS = 10 * 60 * 1000;

/** The word a quiet agent's light says instead of "Working". */
export const QUIET_LABEL = "No recent update";

interface QuietInputs {
  light: AgentLight;
  /** When trace last heard from it: output, a hook, a chat event, or its light changing. */
  heardAt: number;
  /**
   * Background agents or tasks still running after its turn ended. Quiet then is
   * the agent waiting on its own work, which is what Working says (agents.md).
   */
  background: boolean;
  now: number;
}

/** Whether one agent's Working has gone quiet. */
export function isQuiet({ light, heardAt, background, now }: QuietInputs): boolean {
  return light === "working" && !background && now - heardAt >= QUIET_AFTER_MS;
}

/**
 * A group of agents (a session and its companions) shows Working when one is
 * working and none needs you; that Working is quiet only if every working one is.
 */
export function groupQuiet(agents: readonly { light: AgentLight; quiet: boolean }[]): boolean {
  if (agents.some((a) => a.light === "attention")) return false;
  const working = agents.filter((a) => a.light === "working");
  return working.length > 0 && working.every((a) => a.quiet);
}
