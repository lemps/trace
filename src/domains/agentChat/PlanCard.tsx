import { I } from "@/components/Icon";
import type { Plan, PlanStatus } from "./types";

// The agent's task list (Claude's TodoWrite, Codex's plan updates): progress in
// the head, one line per step, the current one bright and finished ones struck.

const WORD: Record<PlanStatus, string> = {
  pending: "To do",
  inProgress: "In progress",
  done: "Done",
};

export function PlanCard({ plan }: { plan: Plan }) {
  const done = plan.items.filter((i) => i.status === "done").length;
  return (
    <div className="ac-card ac-plan">
      <div className="ac-card-head">
        <I.Check size={13} />
        <span className="ac-card-title">Plan</span>
        <span className="ac-card-meta">
          {done} of {plan.items.length} done
        </span>
      </div>
      <ol className="ac-plan-items">
        {plan.items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a plan's steps are positional
          <li key={i} className={item.status}>
            <span className="ac-plan-mark" role="img" aria-label={WORD[item.status]}>
              {item.status === "done" && <I.Check size={11} />}
            </span>
            <span className="ac-plan-text">{item.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
