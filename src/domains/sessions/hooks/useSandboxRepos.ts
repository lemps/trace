import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { repoDetails } from "@/ipc/repoSetup";
import { sandboxRepos } from "../sessionHost";

/** The repos a sandbox can run, and the ones it can't, by path. */
export interface SandboxRepos {
  usable: string[];
  skipped: string[];
}

/**
 * Which configured repos a Vercel Sandbox can run (it clones the GitHub origin),
 * read once `enabled` turns on. Null until then, or while reading them.
 */
export function useSandboxRepos(enabled: boolean): SandboxRepos | null {
  const [repos, setRepos] = useState<SandboxRepos | null>(null);
  const wanted = enabled && repos === null;
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    repoDetails()
      .then((details) => {
        if (!cancelled) setRepos(sandboxRepos(details));
      })
      .catch((err) => toast.error(`Couldn't read your repositories' origins: ${String(err)}`));
    return () => {
      cancelled = true;
    };
  }, [wanted]);
  return repos;
}
