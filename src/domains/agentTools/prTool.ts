import type Anthropic from "@anthropic-ai/sdk";
import { discoverPrs } from "@/domains/prs/hooks/usePrWatch";
import { usePrWatchStore } from "@/domains/prs/watchStore";
import { prThread } from "@/ipc/prWatch";
import { need } from "./args";
import { cachedPrs, prLine } from "./prCache";
import { findSession } from "./sessionTools";

// A session's pull request, through the PR watcher's own calls
// (`workspace_prs`, `pr_thread`, both `gh`), refreshing its cache as the
// Sessions page's PR pane does. list_sessions shows the cache only.

export const GET_SESSION_PR: Anthropic.Tool = {
  name: "get_session_pr",
  description:
    "Get the pull request a session raised: number, title, state (open, draft, merged, closed), its checks (passing, failing, running, with counts) and URL, plus any other PRs it raised. Looks the session's PRs up fresh through the same gh calls trace's PR pane makes. Says so when the session has no PR.",
  input_schema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "The session's id (from start_session or list_sessions), or its exact title.",
      },
    },
    required: ["session_id"],
  },
};

/**
 * Bring the watcher's copy up to date, as its pane does when it's open: look
 * for PRs (it may have raised one since), then re-read each one's state and
 * checks. The cache alone goes stale while no view of the session is open.
 */
async function fetchPrs(workspaceId: string): Promise<void> {
  await discoverPrs(workspaceId);
  const urls = usePrWatchStore.getState().links[workspaceId] ?? [];
  await Promise.all(
    urls.map((url) =>
      prThread(workspaceId, url)
        .then((t) => usePrWatchStore.getState().setThread(url, t))
        .catch((e) => usePrWatchStore.getState().setError(url, String(e)))
    )
  );
}

/** Run get_session_pr. */
export async function runGetSessionPr(input: unknown): Promise<string> {
  const session = findSession(need(input, "session_id"));
  await fetchPrs(session.id);
  const prs = cachedPrs(session.id);
  const head = `"${session.title}" (id ${session.id})`;
  if (prs.length === 0) {
    const errors = usePrWatchStore.getState().errors;
    const failed = (usePrWatchStore.getState().links[session.id] ?? []).filter((u) => errors[u]);
    return failed.length
      ? `${head}: couldn't read its PR (${errors[failed[0]]}).`
      : `${head} has no pull request yet.`;
  }
  const [main, ...rest] = prs;
  const lines = [`${head}: ${prLine(main)}`];
  if (rest.length) lines.push("Other PRs:", ...rest.map((t) => `- ${prLine(t)}`));
  return lines.join("\n");
}
