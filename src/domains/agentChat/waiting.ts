import type { Approval, JournalRow, QuestionSet } from "./types.ts";

// Whether a chat agent is waiting on you: an approval or question it asked is
// still open. Its turn is technically still running (`working.ts` stays true,
// so Stop and Esc still cancel the prompt), but the view says so differently:
// no Working row, and the composer asks for the answer rather than a steer.

export type OpenPrompt =
  | { kind: "approval"; approval: Approval }
  | { kind: "question"; questions: QuestionSet };

/** Approvals and questions still waiting for an answer, oldest first. */
export function openPrompts(rows: readonly JournalRow[]): OpenPrompt[] {
  const out: OpenPrompt[] = [];
  for (const row of rows) {
    const b = row.body;
    if (b.kind === "approval" && !b.resolution) out.push({ kind: "approval", approval: b });
    if (b.kind === "question" && !b.resolution) out.push({ kind: "question", questions: b });
  }
  return out;
}

/** The conversation has a prompt open for you to answer. */
export function isWaitingOnYou(rows: readonly JournalRow[]): boolean {
  return rows.some(
    (row) => (row.body.kind === "approval" || row.body.kind === "question") && !row.body.resolution
  );
}
