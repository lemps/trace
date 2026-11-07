import { useRef, useState } from "react";
import { I } from "@/components/Icon";
import { useAppearance } from "@/domains/appearance/store";
import { runSentence, type ToolStep } from "./blocks";
import { ToolRow } from "./ToolRow";

interface ToolRunProps {
  steps: ToolStep[];
  workspaceId: string;
  root: string | null;
  /** This is the newest block and the agent is mid-turn. */
  isCurrent: boolean;
}

// Consecutive tool calls between two pieces of prose, as one block. A run of
// several folds to a sentence ("Read 4 files and ran 2 commands"); the run the
// agent is in right now opens so you can watch it, and stays open (until you
// fold it) once the agent moves on: a run never closes by itself, or it would
// flicker shut each time the agent stops being "in" it between calls.
export function ToolRun({ steps, workspaceId, root, isCurrent }: ToolRunProps) {
  const [choice, setChoice] = useState<boolean | null>(null);
  const tools = useAppearance((s) => s.prefs.chat.tools);
  // Latched: once it's been the current run, it stays open.
  const watched = useRef(false);
  if (isCurrent) watched.current = true;
  const rows = (live: boolean) =>
    steps.map((step) => (
      <ToolRow key={step.call.id} step={step} workspaceId={workspaceId} root={root} isLive={live} />
    ));
  if (steps.length === 1) return <div className="tx-run">{rows(isCurrent)}</div>;

  const open = choice ?? (watched.current || tools !== "folded");
  const failed = steps.filter((s) => s.result?.isError).length;
  return (
    <div className={`tx-run multi${open ? " open" : ""}`}>
      <button
        type="button"
        className="tx-run-head"
        aria-expanded={open}
        onClick={() => setChoice(!open)}
      >
        <span className="tx-chev">
          <I.Chevron size={12} />
        </span>
        <span className="tx-run-sentence">{runSentence(steps)}</span>
        {failed > 0 && <span className="tx-tool-state error">{failed} failed</span>}
        <span className="tx-run-count">{steps.length}</span>
      </button>
      {open && <div className="tx-run-rows">{rows(isCurrent)}</div>}
    </div>
  );
}
