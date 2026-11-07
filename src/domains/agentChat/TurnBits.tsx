import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";
import { useHint } from "@/platform/shortcuts";
import { formatDuration, usageFacts } from "./format";
import { useNow } from "./hooks/useNow";
import type { ChatTurn } from "./projection";
import type { Status } from "./types";

// The small rows around a turn's content: notices, the footer a finished turn
// ends with, and the live "Working…" line.

export function StatusRow({ status }: { status: Status }) {
  if (status.tone === "info") return <div className="tx-notice">{status.text}</div>;
  return (
    <div
      className={`ac-status ${status.tone}`}
      role={status.tone === "error" ? "alert" : undefined}
    >
      {status.tone === "error" ? <I.X size={13} /> : <I.Bolt size={13} />}
      <span>{status.text}</span>
    </div>
  );
}

const ENDED: Record<string, string> = {
  completed: "Worked",
  interrupted: "Interrupted after",
  failed: "Failed after",
};

/** "Worked 3m 12s · 64.9k in · 5.9k out · 212k cached · $0.41". */
export function TurnFooter({ turn }: { turn: ChatTurn }) {
  const { summary } = turn;
  if (!summary || summary.state === "running") return null;
  const facts: string[] = [];
  const word = ENDED[summary.state] ?? "Worked";
  facts.push(
    summary.durationMs !== undefined
      ? `${word} ${formatDuration(summary.durationMs)}`
      : word.replace(/ after$/, "")
  );
  if (summary.usage) facts.push(...usageFacts(summary.usage));
  return (
    <div className={`tx-turn-end ac-turn-end ${summary.state}`}>
      <span>{facts.join(" · ")}</span>
    </div>
  );
}

/**
 * The agent is at work: the working light, how long the turn has run, how many
 * subagents are still going, and the way to stop it all (also Esc).
 */
export function WorkingRow({
  since,
  subagents,
  onInterrupt,
}: {
  since: number | null;
  subagents: number;
  onInterrupt: () => void;
}) {
  const now = useNow(true);
  const hint = useHint("chatInterrupt");
  const age = since && now > since ? formatDuration(now - since) : undefined;
  const others = subagents > 0 ? `${subagents} ${subagents === 1 ? "subagent" : "subagents"}` : "";
  // Between turns only subagents are left working.
  const label = since === null && others ? `${others} working…` : "Working…";
  return (
    <div className="ac-working">
      <StatusLight light="working" variant="word" label={label} age={age} />
      {since !== null && others && <span className="ac-working-subs">· {others}</span>}
      <button
        type="button"
        className="btn ac-working-stop"
        onClick={onInterrupt}
        title="Stop the turn and every subagent; the agent stays up"
      >
        <I.X size={13} /> Interrupt <span className="kbd">{hint}</span>
      </button>
    </div>
  );
}
