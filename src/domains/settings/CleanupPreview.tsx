import { BusyLabel } from "@/components/BusyLabel";
import { InlineConfirm } from "@/components/InlineConfirm";
import type { CleanupReport } from "@/ipc/cleanup";
import { SettingRow } from "./SettingRow";
import { worktreeCount } from "./useCleanup";
import { deleteCount } from "./worktreeModel";

interface CleanupPreviewProps {
  /** Auto-cleanup is on (the preview only runs then). */
  enabled: boolean;
  /** Null until the first preview; afterwards the latest, kept while the next is worked out. */
  report: CleanupReport | null;
  /** A new preview is on its way: the line shows the previous one, dimmed. */
  stale: boolean;
  /** "Clean up now" is running. */
  running: boolean;
  onRun: () => void;
}

const NEVER =
  "Never deleted: workspaces with uncommitted changes or a running agent. A branch with unpushed commits is kept, so starting the workspace again checks it back out.";

/** One line for what the next pass does; which rows it touches is marked in the list above. */
function summary(report: CleanupReport | null): string {
  if (!report) return "Checking workspaces…";
  const n = deleteCount(report);
  const kept = report.items.length - n;
  if (report.items.length === 0) return "Nothing matches these rules right now.";
  if (n === 0) return `The next pass deletes nothing: it keeps ${worktreeCount(kept)}.`;
  return `The next pass deletes ${worktreeCount(n)}.`;
}

// What the auto-cleanup rules select right now, as one summary line with
// "Clean up now". The worktrees themselves are marked in the Worktrees list.
export function CleanupPreview({ enabled, report, stale, running, onRun }: CleanupPreviewProps) {
  const n = deleteCount(report);
  return (
    <div className={stale ? "cleanup-summary stale" : "cleanup-summary"}>
      <SettingRow
        label={enabled ? summary(report) : "Next pass"}
        hint={NEVER}
        inactive={!enabled}
        inactiveReason="Turn on auto-cleanup to see what it would delete."
      >
        <InlineConfirm
          className="btn sm"
          size="sm"
          label={<BusyLabel busy={running} idle="Clean up now" working="Cleaning up…" />}
          disabled={!enabled || running || n === 0}
          message={`Delete ${worktreeCount(n)} now?`}
          confirmLabel={`Delete ${n}`}
          onConfirm={onRun}
        />
      </SettingRow>
    </div>
  );
}
