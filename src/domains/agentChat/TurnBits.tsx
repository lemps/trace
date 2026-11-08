import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";
import { formatDuration, usageFacts } from "./format";
import { useNow } from "./hooks/useNow";
import type { ChatTurn } from "./projection";
import type { Status } from "./types";

// The small rows around a turn's content: notices, the footer a finished turn
// ends with, and the live Working line.

export function StatusRow({ status }: { status: Status }) {
  if (status.tone === "info") return <div className="tx-notice">{status.text}</div>;
  return (
    <div
      className={`ac-status ${status.tone}`}
      role={status.tone === "error" ? "alert" : undefined}
    >
      {status.tone === "error" ? <I.X size={14} /> : <I.Alert size={14} />}
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
 * The agent is at work: the working light, how long the turn has run and how many
 * subagents are still going. Stopping it is the composer's (and Esc's).
 */
export function WorkingRow({ since, subagents }: { since: number | null; subagents: number }) {
  const now = useNow(true);
  const age = since && now > since ? formatDuration(now - since) : undefined;
  const others = subagents > 0 ? `${subagents} ${subagents === 1 ? "subagent" : "subagents"}` : "";
  // Between turns only subagents are left working: no turn time, just how many.
  return (
    <div className="ac-working">
      <StatusLight light="working" variant="word" age={age} />
      {others && <span className="ac-working-subs">· {others}</span>}
    </div>
  );
}
