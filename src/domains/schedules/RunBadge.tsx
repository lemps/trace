import { useLiveStore } from "@/domains/live/store";
import { STATUS_LABEL } from "./describe";
import { runWorkspaceId } from "./ids";
import type { ScheduleRun } from "./types";

/**
 * Whether a live run is stuck on the user right now: its agent has a dialog open
 * (the hook-reported ask, `live/sync`), which only an answer, a new prompt or the
 * turn ending clears. Not the quiet timer: any output reads as "working", and the
 * note this shows above the terminal resizes it, so the TUI's repaint knocked the
 * note away and the quiet brought it back, over and over (the run viewer flickered).
 * The backend's `needsInput` stays set after an answer, so it can't say "still".
 */
export function useRunNeedsYou(run: ScheduleRun | undefined): boolean {
  const asking = useLiveStore((s) => (run ? s.info[runWorkspaceId(run.id)]?.ask != null : false));
  return !!run && run.status === "running" && asking;
}

// Status dot + label for one run.
export function RunBadge({ run }: { run: ScheduleRun }) {
  const needsYou = useRunNeedsYou(run);
  if (needsYou) return <span className="waiting">needs input</span>;
  if (run.status === "running") return <span className="thinking">running</span>;
  return (
    <span className={`run-badge ${run.status}`}>
      <span className="run-dot" />
      {STATUS_LABEL[run.status]}
    </span>
  );
}
