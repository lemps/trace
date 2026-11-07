import { formatDuration } from "./describe";
import type { PrecheckResult, ScheduleRun } from "./types";

/** "exit 1", "timed out", "killed" — the precheck's outcome in a couple of words. */
export function precheckOutcome(p: PrecheckResult): string {
  if (p.timedOut) return "timed out";
  if (p.exitCode == null) return "killed";
  return `exit ${p.exitCode}`;
}

/** The run ended at its precheck (skipped, timed out, killed): no agent ran. */
export function stoppedAtPrecheck(run: ScheduleRun): boolean {
  return !!run.precheck && run.precheck.exitCode !== 0;
}

// What the prompt's precheck did before this run. A skipped run is all
// precheck — no agent ever started — so it gets the reason and the output; a
// run that went ahead gets a one-line note.
export function PrecheckNote({ run }: { run: ScheduleRun }) {
  const p = run.precheck;
  if (!p) return null;
  const took = p.millis < 1000 ? `${p.millis}ms` : formatDuration(p.millis / 1000);
  if (run.status !== "skipped" && p.exitCode === 0) {
    return (
      <div className="sched-viewer-note muted">
        Precheck passed ({precheckOutcome(p)} · {took}), so the prompt ran.
      </div>
    );
  }
  return (
    <div className="sched-precheck">
      {run.status === "skipped" && (
        <div className="sched-precheck-head">
          Skipped: the precheck finished with {precheckOutcome(p)} after {took}, so the prompt
          didn't run.
        </div>
      )}
      <code className="sched-precheck-cmd">{p.command}</code>
      {p.output ? (
        <pre className="sched-precheck-output">{p.output}</pre>
      ) : (
        <div className="sched-precheck-empty">It printed nothing.</div>
      )}
    </div>
  );
}
