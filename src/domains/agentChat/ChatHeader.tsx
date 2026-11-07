import { I } from "@/components/Icon";
import { formatCost, limitLabel, resetsIn } from "./format";
import type { ChatTurn } from "./projection";
import type { LimitWindow, SessionInfo } from "./types";

// The chat's fact strip: which agent and model, the session's cost so far, the
// usage-limit windows the agent reports (how full, and when each resets), and
// Stop agent: ending the process, as opposed to interrupting a turn.

interface ChatHeaderProps {
  info: SessionInfo | undefined;
  turns: ChatTurn[];
  /** End the agent's process (shown while it runs). */
  onStop?: () => void;
}

export function ChatHeader({ info, turns, onStop }: ChatHeaderProps) {
  let cost = 0;
  let hasCost = false;
  for (const t of turns) {
    const c = t.summary?.usage?.costUsd;
    if (c !== undefined) {
      cost += c;
      hasCost = true;
    }
  }
  return (
    <div className="ac-head">
      <span className="ac-head-agent">{info?.agent ?? "Agent"}</span>
      {info?.model && <span className="ac-head-model">{info.model}</span>}
      {hasCost && (
        <span className="ac-head-fact" title="Cost of this conversation so far">
          {formatCost(cost)}
        </span>
      )}
      <span className="ac-head-limits">
        {(info?.limits ?? []).map((w) => (
          <Limit key={w.name} window={w} />
        ))}
      </span>
      {onStop && (
        <button
          type="button"
          className="btn ghost ac-head-stop"
          onClick={onStop}
          title="End the agent's process. The conversation is kept; Start carries it on."
        >
          <I.X size={13} /> Stop agent
        </button>
      )}
    </div>
  );
}

function Limit({ window: w }: { window: LimitWindow }) {
  const pct = Math.round(Math.min(1, Math.max(0, w.utilization)) * 100);
  const level = pct >= 95 ? " full" : pct >= 80 ? " high" : "";
  const reset = resetsIn(w.resetsAt, Date.now());
  const label = limitLabel(w.name);
  return (
    <span
      className={`ac-limit${level}`}
      title={`${label} limit: ${pct}% used${reset ? `, resets ${reset}` : ""}`}
    >
      <span className="ac-limit-name">{label}</span>
      <span className="ac-limit-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="ac-limit-pct">{pct}%</span>
      {reset && <span className="ac-limit-reset">{reset}</span>}
    </span>
  );
}
