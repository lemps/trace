import { usePrWatchStore } from "@/domains/prs/watchStore";
import type { PrThread } from "@/ipc/prWatch";

// What the PR watcher (`usePrWatch`) already knows about a workspace's PRs, as
// text for the agent tools. Reads the cache only; get_session_pr fetches.

const CHECKS: Record<NonNullable<PrThread["checks"]>, string> = {
  ok: "checks passing",
  fail: "checks failing",
  pending: "checks running",
};

/** "checks failing (2 failed, 5 passed)", or "no checks". */
function checksText(t: PrThread): string {
  if (!t.checks) return "no checks";
  const count = (states: string[]) => t.checkRuns.filter((c) => states.includes(c.state)).length;
  const parts = [
    [count(["failed"]), "failed"],
    [count(["running", "queued"]), "running"],
    [count(["passed"]), "passed"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, w]) => `${n} ${w}`);
  return parts.length ? `${CHECKS[t.checks]} (${parts.join(", ")})` : CHECKS[t.checks];
}

/** One PR on one line. */
export function prLine(t: PrThread): string {
  return `PR #${t.number} "${t.title}" · ${t.state} · ${checksText(t)} · ${t.url}`;
}

/** A workspace's PRs the watcher has fetched, an open or draft one first. */
export function cachedPrs(workspaceId: string): PrThread[] {
  const { links, threads } = usePrWatchStore.getState();
  const known = (links[workspaceId] ?? []).flatMap((u) => (threads[u] ? [threads[u]] : []));
  const live = (t: PrThread) => t.state === "open" || t.state === "draft";
  return [...known.filter(live), ...known.filter((t) => !live(t))];
}

/** The PR `list_sessions` shows beside a session: cached only, never fetched. */
export function cachedPrLine(workspaceId: string): string {
  const [pr] = cachedPrs(workspaceId);
  return pr ? `PR #${pr.number} ${pr.state}${pr.checks ? ` (${CHECKS[pr.checks]})` : ""}` : "";
}
