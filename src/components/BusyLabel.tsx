import type { ReactNode } from "react";

interface BusyLabelProps {
  busy: boolean;
  /** The button's word at rest ("Raise PR", "Merge #12"). */
  idle: ReactNode;
  /** The verb while it works ("Raising…", "Merging…"). */
  working: ReactNode;
}

// A busy button says the verb in reserved width (trace-ui §2 rule 7): both words sit
// in one grid cell and only one is visible, so the button is as wide as the longer
// and never jumps when it swaps. The hidden word is out of the accessible name too.
export function BusyLabel({ busy, idle, working }: BusyLabelProps) {
  return (
    <span className="busy-label">
      <span className={busy ? "busy-off" : undefined}>{idle}</span>
      <span className={busy ? undefined : "busy-off"}>{working}</span>
    </span>
  );
}
