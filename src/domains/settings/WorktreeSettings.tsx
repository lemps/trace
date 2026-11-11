import { useMemo } from "react";
import { CleanupSection } from "./AutoCleanupSettings";
import { useCleanup } from "./useCleanup";
import { useWorktrees } from "./useWorktrees";
import { WorktreeList } from "./WorktreeList";
import { cleanupMarks } from "./worktreeModel";

// Settings → Worktrees: every worktree trace made, then the auto-cleanup rules.
// One component draws both because they share state: the cleanup preview isn't a
// second list, it's marked on the worktrees' own rows ("Deleted on the next pass").
export function WorktreeSettings() {
  const cleanup = useCleanup();
  // Removing one by hand changes what the next pass would do.
  const worktrees = useWorktrees(cleanup.repreview);
  const marks = useMemo(
    () => cleanupMarks(worktrees.worktrees, cleanup.report),
    [worktrees.worktrees, cleanup.report]
  );

  return (
    <>
      <WorktreeList state={worktrees} marks={marks} stale={cleanup.stale} />
      <CleanupSection cleanup={cleanup} onCleaned={worktrees.refresh} />
    </>
  );
}
