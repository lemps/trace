import { useEffect } from "react";
import { useSandboxRepos } from "@/domains/sessions/hooks/useSandboxRepos";
import { sandboxRepoNote } from "@/domains/sessions/sessionHost";
import type { RunsOn } from "@/ipc/agent";
import { basename } from "@/platform/paths";

/**
 * The repos the start prompt offers: all of them on this machine, only those with a
 * GitHub origin for a sandbox (it clones from GitHub), with why the rest are missing.
 * Moves the pick onto one the sandbox can use when it isn't on one.
 */
export function usePickableRepos(
  host: RunsOn,
  repos: string[],
  choice: string,
  choose: (path: string) => void
): { repos: string[]; note: string | undefined } {
  const sandbox = useSandboxRepos(host === "vercel");
  const offered = host === "vercel" && sandbox ? sandbox.usable : repos;
  const first = offered[0];
  const stray = host === "vercel" && sandbox !== null && !offered.includes(choice);
  useEffect(() => {
    if (stray && first) choose(first);
  }, [stray, first, choose]);
  if (host !== "vercel") return { repos, note: undefined };
  return {
    repos: offered,
    note: sandboxRepoNote(
      sandbox && { usable: sandbox.usable.map(basename), skipped: sandbox.skipped.map(basename) }
    ),
  };
}
