import { lineShell, precheckExample } from "@/platform/shell";

interface PrecheckFieldProps {
  value: string;
  onChange: (value: string) => void;
}

// The schedule form's precheck: one shell line that decides whether a scheduled
// run goes ahead. Mirrors `schedule::precheck` (one line, 2-minute cap).
export function PrecheckField({ value, onChange }: PrecheckFieldProps) {
  return (
    <label className="field">
      <span className="field-label">Precheck (optional)</span>
      <input
        className="field-input sched-mono"
        type="text"
        spellCheck={false}
        placeholder={`e.g. ${precheckExample}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="field-note">
        One {lineShell} line, run in the prompt's worktree before each scheduled run. Exit 0 runs
        the prompt; any other exit skips it, and the run history says why. It gets 2 minutes and can
        read <code>TRACE_LAST_RUN_AT</code> (epoch seconds). Run now doesn't check it.
      </span>
    </label>
  );
}
