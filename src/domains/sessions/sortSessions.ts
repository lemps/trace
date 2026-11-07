import type { AgentLight } from "../live/types.ts";
import { creatorKey, creatorLabel, creatorOf, parentSessionId } from "./createdBy.ts";
import type { ScratchSession } from "./types.ts";

// How a list on the Sessions page is ordered. Pure (relative `.ts` imports) so
// `npm test` can load it. Every sort starts from the manual order, so ties keep
// the user's arrangement and nothing reshuffles when an unrelated value changes.

export type SortMode = "manual" | "status" | "creator" | "name" | "newest" | "oldest" | "active";

export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "status", label: "Status" },
  { id: "creator", label: "Started by" },
  { id: "name", label: "Name (A–Z)" },
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "active", label: "Last active" },
];

const MODE_IDS = new Set<string>(SORT_MODES.map((m) => m.id));

/** A stored sort, or Manual when it isn't one this build knows. */
export function asSortMode(raw: unknown): SortMode {
  return typeof raw === "string" && MODE_IDS.has(raw) ? (raw as SortMode) : "manual";
}

export function sortLabel(mode: SortMode): string {
  return SORT_MODES.find((m) => m.id === mode)?.label ?? "Manual";
}

/** Status order: what needs you first, then what's moving, then what's idle. */
const STATUS_RANK: Record<AgentLight, number> = { attention: 0, working: 1, ready: 2, stopped: 3 };

export interface SortContext {
  /** Each session's light across its agents (`sessionLight`), by session id. */
  lights: Record<string, AgentLight>;
  /** Epoch ms of each session's newest activity, by session id. */
  lastActive: Record<string, number>;
  /** The list's saved manual order, top first. */
  order: readonly string[];
}

/** A row as shown: the session, and how far it's indented under its parent. */
export interface Placed {
  session: ScratchSession;
  depth: number;
}

/** Deepest a child is indented; deeper descendants line up with it. */
const MAX_DEPTH = 2;

const newestFirst = (a: ScratchSession, b: ScratchSession) => b.createdAt - a.createdAt;

/**
 * Stored order made valid against what's in the list: strings only, each id
 * once, only ids that are in `known`. Stored data is untrusted.
 */
export function cleanOrder(raw: unknown, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * The manual order: sessions the saved order doesn't mention yet (new ones, or
 * ones just moved in) at the top, newest first, then the saved order.
 */
export function manualOrder(
  items: readonly ScratchSession[],
  order: readonly string[]
): ScratchSession[] {
  const byId = new Map(items.map((s) => [s.id, s]));
  const placed = cleanOrder(order, new Set(byId.keys()));
  const inOrder = new Set(placed);
  const fresh = items.filter((s) => !inOrder.has(s.id)).sort(newestFirst);
  return [...fresh, ...placed.map((id) => byId.get(id) as ScratchSession)];
}

/**
 * Started by: what you started first, then one group per other creator (by its
 * name); an agent-started session sits indented under its parent when the
 * parent is in the same list, so a session and the work it spawned read as one.
 */
function byCreator(base: ScratchSession[]): Placed[] {
  const ids = new Set(base.map((s) => s.id));
  const children = new Map<string, ScratchSession[]>();
  const roots: ScratchSession[] = [];
  for (const s of base) {
    const parent = parentSessionId(s);
    if (parent && parent !== s.id && ids.has(parent)) {
      children.set(parent, [...(children.get(parent) ?? []), s]);
    } else roots.push(s);
  }
  const groupName = (s: ScratchSession) => {
    const cb = creatorOf(s);
    return cb.kind === "user" ? "" : `${creatorLabel(cb)}\u0000${creatorKey(cb)}`;
  };
  const sortedRoots = [...roots].sort((a, b) =>
    groupName(a).localeCompare(groupName(b), undefined, { sensitivity: "base" })
  );
  const out: Placed[] = [];
  const seen = new Set<string>();
  const visit = (s: ScratchSession, depth: number) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push({ session: s, depth: Math.min(depth, MAX_DEPTH) });
    for (const c of children.get(s.id) ?? []) visit(c, depth + 1);
  };
  for (const r of sortedRoots) visit(r, 0);
  // A parent loop (A started by B started by A) has no root; show them anyway.
  for (const s of base) visit(s, 0);
  return out;
}

/** The list's rows in `mode`. Ties keep the manual order (the sort is stable). */
export function sortSessions(
  items: readonly ScratchSession[],
  mode: SortMode,
  ctx: SortContext
): Placed[] {
  const base = manualOrder(items, ctx.order);
  const flat = (list: ScratchSession[]) => list.map((session) => ({ session, depth: 0 }));
  const by = (cmp: (a: ScratchSession, b: ScratchSession) => number) => flat([...base].sort(cmp));
  const active = (s: ScratchSession) => ctx.lastActive[s.id] ?? s.createdAt * 1000;
  switch (mode) {
    case "manual":
      return flat(base);
    case "status":
      return by(
        (a, b) =>
          STATUS_RANK[ctx.lights[a.id] ?? "stopped"] - STATUS_RANK[ctx.lights[b.id] ?? "stopped"]
      );
    case "creator":
      return byCreator(base);
    case "name":
      return by((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true })
      );
    case "newest":
      return by(newestFirst);
    case "oldest":
      return by((a, b) => a.createdAt - b.createdAt);
    case "active":
      return by((a, b) => active(b) - active(a));
  }
}

/** `ids` with `id` moved one place up (-1) or down (+1); unchanged at an end. */
export function moveBy(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const at = ids.indexOf(id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= ids.length) return [...ids];
  const out = [...ids];
  [out[at], out[to]] = [out[to], out[at]];
  return out;
}

/** `ids` with `id` placed just before `beforeId` (null = at the end), once. */
export function insertBefore(
  ids: readonly string[],
  id: string,
  beforeId: string | null
): string[] {
  const without = ids.filter((x) => x !== id);
  const at = beforeId === null ? -1 : without.indexOf(beforeId);
  if (at < 0) return [...without, id];
  return [...without.slice(0, at), id, ...without.slice(at)];
}

/**
 * Hold a list's order while the user is pointing at or dragging in it: rows
 * already shown keep their places, gone ones drop out, new ones go on top. Pure
 * — the hook that keeps `previous` lives with the list.
 */
export function heldOrder(previous: readonly string[], next: readonly string[]): string[] {
  const now = new Set(next);
  const kept = previous.filter((id) => now.has(id));
  const had = new Set(kept);
  return [...next.filter((id) => !had.has(id)), ...kept];
}
