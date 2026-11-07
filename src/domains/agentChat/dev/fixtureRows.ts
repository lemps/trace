import type { JournalBody, JournalRow } from "../types.ts";

// Builders for the fixture journal: rows get increasing `seq` in the order
// they're made, so the fixture's array literal is also its journal order.

export const T0 = Date.UTC(2026, 10, 7, 9, 30);
let seq = 0;

export function row(
  id: string,
  turnId: string | undefined,
  body: JournalBody,
  revision = 0
): JournalRow {
  seq += 1;
  return { id, revision, seq, at: T0 + seq * 4000, turnId, body };
}

export const user = (id: string, turnId: string, text: string) =>
  row(id, turnId, { kind: "message", role: "user", text, streaming: false });
export const say = (
  id: string,
  turnId: string,
  text: string,
  role: "assistant" | "reasoning" = "assistant"
) => row(id, turnId, { kind: "message", role, text, streaming: false }, 3);
