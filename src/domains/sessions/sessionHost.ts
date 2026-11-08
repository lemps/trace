import type { ScratchSession, SessionHost } from "./types.ts";

// What a session on another host (a Vercel Sandbox) can't do, and how to say
// where it runs. Pure (relative `.ts` imports) so `npm test` can run it.

/** Mirrors the backend's refusal in `commands/session_host.rs`. */
export const SANDBOX_NO_AGENTS = "A Vercel Sandbox session can't have extra agents yet";

/**
 * Why "+ agent" is off for this session, or null when it can take another. A
 * sandbox session can't have any (the backend refuses); a local one stops at `max`.
 */
export function addAgentBlocker(session: ScratchSession, max: number): string | null {
  if (session.host) return SANDBOX_NO_AGENTS;
  if ((session.agents?.length ?? 0) >= max) {
    return "This session already has the maximum number of agents";
  }
  return null;
}

/** Where a sandbox session's agent works, for its start overlay. */
export function hostHint(host: SessionHost): string {
  return host.remote
    ? `Runs in a Vercel Sandbox cloned from ${host.remote}, not on this computer.`
    : "Runs in a Vercel Sandbox, not on this computer.";
}
