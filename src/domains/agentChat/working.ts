import { type Chat, isTurnLive, runningSubagents } from "./projection.ts";
import type { SessionInfo } from "./types.ts";

// Whether a chat agent is at work: a turn running, or subagents still going
// after the turn that started them ended (Claude's background agents). The
// board, Fleet, the Needs-you light, the Interrupt control and Esc all go by
// this, so an agent whose turn ended but whose subagents haven't still reads as
// working and can still be stopped.

/** From what the agent reports. */
export function isWorkingInfo(info: SessionInfo | undefined): boolean {
  return info !== undefined && (info.busy || (info.runningSubagents ?? 0) > 0);
}

/**
 * For the chat view: what the agent reports decides; the rows do only when it
 * has reported nothing (the dev fixture page, a view mounted before any event).
 */
export function isAgentWorking(info: SessionInfo | undefined, chat: Chat): boolean {
  if (info) return isWorkingInfo(info);
  return isTurnLive(chat.turns[chat.turns.length - 1]) || runningSubagents(chat) > 0;
}
