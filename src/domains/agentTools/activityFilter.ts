import type { ActivityEvent } from "@/domains/activity/types";

// read_activity's filters over trace's activity log. Pure, so `npm test` can
// load it.

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/** One turn-end per turn: left out unless asked for by kind. */
const CHATTY = "agent-turn-end";

const UNIT_MS: Record<string, number> = {
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
};

/**
 * `since` as epoch ms: an ISO time ("2026-11-07T09:00:00Z"), or a span back
 * from `now` ("last 2h", "90m", "3 days"). Throws on anything else.
 */
export function parseSince(since: string, now: number): number {
  const text = since.trim().toLowerCase();
  const span = /^(?:last\s+)?(\d+(?:\.\d+)?)\s*([a-z]+)$/.exec(text);
  if (span && UNIT_MS[span[2]]) return now - Number(span[1]) * UNIT_MS[span[2]];
  // A date, or a date and time; a plain number isn't a time. A time with no zone
  // is UTC, like every time read_activity prints.
  const iso = since.trim();
  const zoned = /t.*(?:z|[+-]\d{2}:?\d{2})$/.test(text) || !text.includes("t");
  const at = /\d{4}-\d{2}-\d{2}/.test(text) ? Date.parse(zoned ? iso : `${iso}Z`) : Number.NaN;
  if (Number.isNaN(at)) {
    throw new Error(`since: "${since}" isn't a time. Use an ISO time or a span like "last 2h".`);
  }
  return at;
}

export interface ActivityQuery {
  /** Epoch ms; events before it are left out. */
  since?: number;
  /** Event kinds to keep; all but turn-ends when empty. */
  kinds: string[];
  /** Workspace ids (a session and its companions); any when empty. */
  workspaces: string[];
  /** A ticket key, matched without case. */
  ticket?: string;
  limit: number;
}

/** The events that match, newest first, at most `limit`. */
export function filterActivity(events: ActivityEvent[], q: ActivityQuery): ActivityEvent[] {
  const ticket = q.ticket?.toLowerCase();
  return events
    .filter((e) => (q.since === undefined ? true : e.at >= q.since))
    .filter((e) => (q.kinds.length ? q.kinds.includes(e.kind) : e.kind !== CHATTY))
    .filter(
      (e) => !q.workspaces.length || (!!e.workspaceId && q.workspaces.includes(e.workspaceId))
    )
    .filter((e) => !ticket || e.issueKey?.toLowerCase() === ticket)
    .sort((a, b) => b.at - a.at)
    .slice(0, q.limit);
}

/** One event on one line: time, kind, who, what. */
export function activityLine(e: ActivityEvent): string {
  const at = new Date(e.at).toISOString().replace(/\.\d{3}Z$/, "Z");
  const about = e.issueKey ?? e.subject ?? e.workspaceId;
  return `${at} · ${e.kind} · ${e.actor}${about ? ` · ${about}` : ""} · ${e.title}`;
}
