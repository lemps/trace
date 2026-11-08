import type { CSSProperties } from "react";
import { CONTEXT_DANGER, contextLabel, contextPercent, contextTitle } from "./contextFormat";
import type { ContextUsage } from "./types";

// How full the agent's context window is: a small ring and a percentage in the
// chat header. Neutral until it's nearly full; never amber, blue or green, which
// mean agent state. Hidden until a model call has reported it.

interface ContextGaugeProps {
  context: ContextUsage | undefined;
  agent: string | undefined;
}

export function ContextGauge({ context, agent }: ContextGaugeProps) {
  if (!context || context.window <= 0) return null;
  const pct = contextPercent(context);
  const danger = pct >= CONTEXT_DANGER ? " danger" : "";
  const title = contextTitle(context, agent);
  return (
    <span className={`ac-context${danger}`} title={title} role="img" aria-label={title}>
      <span className="ac-context-ring" style={{ "--pct": pct } as CSSProperties} aria-hidden />
      <span className="ac-context-pct" aria-hidden>
        {contextLabel(context)}
      </span>
    </span>
  );
}
