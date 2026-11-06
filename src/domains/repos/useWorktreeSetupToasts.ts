import { useEffect } from "react";
import { toast } from "@/app/toast";
import { onWorktreeSetup } from "@/ipc/repoSetup";
import { basename } from "@/platform/paths";

// A repo's worktree setup runs in the background while its agent starts, so say
// when it starts, and loudly when it fails — the agent would otherwise be the first
// to find a missing `node_modules`. Success stays quiet beyond a short note.
export function useWorktreeSetupToasts(): void {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void onWorktreeSetup((e) => {
      const where = basename(e.worktree);
      if (e.state === "running") toast.info(`Setting up worktree ${where}…`);
      else if (e.state === "done") toast.success(`Worktree ${where} is set up.`);
      else {
        const last = e.output?.trim().split("\n").pop()?.trim();
        toast.error(`Setup failed in ${where} at “${e.step ?? "?"}”${last ? `: ${last}` : "."}`);
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
