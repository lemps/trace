import type { LiveInfo } from "./types.ts";

// "New since you looked" (Slack's bold unread): a session whose agent finished a
// turn the user hasn't opened the session since. Weight, not colour: the amber
// light and the count stay for Needs you. The pure half — which agents just
// finished a turn, and how the unread list changes — lives here, so it can be
// tested; `unreadSync.ts` wires it to the stores.

/**
 * Agents that just finished a turn: `working` a moment ago, now waiting on the
 * user with no ask of their own (a plain finished turn, or the "waiting for
 * your input" nudge). A permission or question isn't a finished turn, and a
 * repaint of an idle agent the user has already seen goes `working` → `ready`,
 * never to `attention`, so it isn't news either (the board store's ack only
 * clears when the user gives the agent new work). Nor is a repaint flicker of
 * an agent already waiting: `sync.ts` hands its light back its old `since`.
 */
export function finishedTurns(
  prev: Record<string, LiveInfo>,
  next: Record<string, LiveInfo>
): string[] {
  const out: string[] = [];
  for (const [id, info] of Object.entries(next)) {
    const was = prev[id];
    if (was?.light !== "working" || info.light !== "attention") continue;
    if (info.since < was.since) continue;
    if (info.ask && info.ask.kind !== "turn" && info.ask.kind !== "input") continue;
    out.push(id);
  }
  return out;
}

/** `unread` plus `ids`, unchanged (same array) when there's nothing new. */
export function withUnread(unread: readonly string[], ids: readonly string[]): readonly string[] {
  const added = ids.filter((id, i) => !unread.includes(id) && ids.indexOf(id) === i);
  return added.length === 0 ? unread : [...unread, ...added];
}

/** `unread` without `id`, unchanged (same array) when it wasn't there. */
export function withoutUnread(unread: readonly string[], id: string): readonly string[] {
  return unread.includes(id) ? unread.filter((x) => x !== id) : unread;
}

/**
 * Only sessions that still exist; `known` empty means the list hasn't loaded
 * yet, so nothing is dropped. Unchanged (same array) when nothing goes.
 */
export function pruneUnread(
  unread: readonly string[],
  known: readonly string[]
): readonly string[] {
  if (known.length === 0) return unread;
  const kept = unread.filter((id) => known.includes(id));
  return kept.length === unread.length ? unread : kept;
}
