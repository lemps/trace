import { useState } from "react";
import { I } from "@/components/Icon";
import { actionSummary, actionVerb, runWriteTool, WRITE_TOOL_NAMES } from "./mutations";

// An inline, confirm-gated board action requested by the assistant via a
// ```action spec block (the CLI/-p path's equivalent of the SDK's tool use).
// Runs the SAME runWriteTool the SDK tools call, so the effect and the gate are
// identical — only the request mechanism (a text block vs a tool_use) differs.
// Drawn as the agent chat's ask card (`.ac-card.ac-ask`); once answered it
// shrinks to the agent chat's one-line receipt.
type Phase = "idle" | "running" | "done" | "declined";

export function ActionCard({ raw }: { raw: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState("");

  let spec: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    spec = parsed as Record<string, unknown>;
  } catch {
    return <div className="chart-err">Couldn't read that action.</div>;
  }

  const action = typeof spec.action === "string" ? spec.action : "";
  if (!WRITE_TOOL_NAMES.has(action)) {
    return <div className="chart-err">Unknown action "{action}".</div>;
  }

  const run = async () => {
    setPhase("running");
    try {
      setResult(await runWriteTool(action, spec));
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setPhase("done");
  };

  const summary = actionSummary(action, spec);
  // The check marks what you chose (as the agent chat's receipt does); the
  // result says how it went.
  if (phase === "done") {
    return (
      <div className="ac-receipt orch-receipt">
        <I.Check size={12} />
        <span className="orch-receipt-text">{result}</span>
      </div>
    );
  }
  if (phase === "declined") {
    return (
      <div className="ac-receipt">
        <I.X size={12} />
        <span className="ac-receipt-what">Skipped</span>
        <span className="ac-receipt-of">{summary}</span>
      </div>
    );
  }
  return (
    <ConfirmCard
      summary={summary}
      verb={actionVerb(action)}
      cancelLabel="Skip"
      busy={phase === "running"}
      onCancel={() => setPhase("declined")}
      onGo={() => void run()}
    />
  );
}

interface ConfirmCardProps {
  summary: string;
  /** The go button's word: the action's verb ("Move", "Start"). */
  verb: string;
  cancelLabel?: string;
  /** The action is running: both buttons wait. */
  busy?: boolean;
  /** Extra classes (where the card sits). */
  className?: string;
  onCancel: () => void;
  onGo: () => void;
}

/**
 * The human gate before an action runs, as the agent chat's ask card: what it
 * will do, then Cancel and the action's verb (`.btn.primary-needs`, amber,
 * because it's waiting on you). Used inline (an ```action block) and above the
 * composer (an SDK tool call parked on `pendingConfirm`).
 */
export function ConfirmCard({
  summary,
  verb,
  cancelLabel = "Cancel",
  busy = false,
  className,
  onCancel,
  onGo,
}: ConfirmCardProps) {
  return (
    <div className={`ac-card ac-ask orch-ask${className ? ` ${className}` : ""}`}>
      <div className="ac-card-head">
        <I.Bolt size={14} />
        <span className="ac-card-title">{summary}</span>
      </div>
      <div className="ac-ask-actions">
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="btn primary-needs" disabled={busy} onClick={onGo}>
          {verb}
        </button>
      </div>
    </div>
  );
}
