import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";
import { formatDuration } from "./format";
import { useNow } from "./hooks/useNow";
import type { SubagentStatus, SubagentThread } from "./subagents";

// How a subagent is doing, drawn the same on its card, its tab and its view.
// Running is the working light and an open prompt the attention one (agent
// state, `StatusLight`); the ends are words, so a finished one doesn't read as
// an agent ready for you.

const WORD: Record<Exclude<SubagentStatus, "running">, string> = {
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

export function SubagentStatusWord({ thread }: { thread: SubagentThread }) {
  if (thread.pending) return <StatusLight light="attention" variant="word" />;
  if (thread.status === "running") return <StatusLight light="working" variant="word" />;
  return <span className={`ac-agent-state ${thread.status}`}>{WORD[thread.status]}</span>;
}

/** A tab's small mark: a light while it works or asks, a glyph once it's over. */
export function SubagentMark({ status, pending }: { status: SubagentStatus; pending: boolean }) {
  if (pending) return <StatusLight light="attention" />;
  if (status === "running") return <StatusLight light="working" />;
  if (status === "done") {
    return (
      <span className="ac-mark done" role="img" aria-label="Done">
        <I.Check size={11} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="ac-mark failed" role="img" aria-label="Failed">
        <I.X size={11} />
      </span>
    );
  }
  return <StatusLight light="stopped" label="Stopped" />;
}

/**
 * How long it's run: ticking while it runs, its reported time once it ends. A
 * stopped one's last report is from before it stopped, so it shows none.
 */
export function useElapsed(thread: SubagentThread): string | null {
  const running = thread.status === "running";
  const now = useNow(running);
  if (running) return formatDuration(Math.max(0, now - thread.startedAt));
  if (thread.status === "stopped" || thread.durationMs === null) return null;
  return formatDuration(thread.durationMs);
}

/** A report as a card's two lines: plain text, its lines run together. */
export function plainLine(text: string): string {
  return text
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*(?:[-*+]|\d+\.|#+)\s+/, "")
        .replace(/`+|\*\*|__/g, "")
        .trim()
    )
    .filter(Boolean)
    .join(" · ");
}
