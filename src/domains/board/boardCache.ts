import type { BoardData, PullRequest } from "@/domains/issues/types";
import { getIssuePullRequests } from "@/ipc/issues";

// Each board's last cards and PR badges, kept in memory for this run, so going
// back to a board (Jira's page, then Pylon's, then Jira's again) shows it at once
// while it reloads. And the PR lookups behind the badges, one request per card:
// a few at a time rather than all at once, and not asked again within
// `PR_FRESH_MS` of the last answer. The tracker stays the source of truth: every
// load still fetches the board.

interface Snapshot {
  data: BoardData;
  pullRequests: Record<string, PullRequest[]>;
}

const snapshots = new Map<string, Snapshot>();

/** The board as it was last shown this run, if it was. */
export function boardSnapshot(boardKey: string): Snapshot | undefined {
  return snapshots.get(boardKey);
}

export function rememberBoard(
  boardKey: string,
  data: BoardData,
  pullRequests: Record<string, PullRequest[]>
): void {
  snapshots.set(boardKey, { data, pullRequests });
}

/** Forget every board (a tracker was disconnected). */
export function forgetBoards(): void {
  snapshots.clear();
  askedAt.clear();
}

/** A card's PRs answered less than this long ago aren't asked for again on a load. */
const PR_FRESH_MS = 2 * 60_000;
/** PR lookups in flight at once: enough to fill a board quickly, not to be throttled. */
const PR_PARALLEL = 6;
/** When each issue's PRs were last answered, by issue id. */
const askedAt = new Map<string, number>();

interface PrRequest {
  id: string;
  key: string;
  /** Bust Jira's dev-status cache (a PR known to be live). */
  fresh?: boolean;
}

/**
 * Look up the PRs of `issues` on Jira, `PR_PARALLEL` at a time, handing each answer
 * to `onPrs`. Unless `all`, issues answered within `PR_FRESH_MS` are skipped.
 * Failures are silent: no dev-status integration means no badge, not an error.
 */
export async function lookUpPrs(
  issues: PrRequest[],
  onPrs: (issueKey: string, prs: PullRequest[]) => void,
  all = false
): Promise<void> {
  const now = Date.now();
  const queue = all
    ? [...issues]
    : issues.filter((i) => now - (askedAt.get(i.id) ?? 0) > PR_FRESH_MS);
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        const prs = await getIssuePullRequests("jira", next.id, next.fresh);
        askedAt.set(next.id, Date.now());
        onPrs(next.key, prs);
      } catch {
        // Silent, as above.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PR_PARALLEL, queue.length) }, worker));
}

// A hot update would leave the store on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
