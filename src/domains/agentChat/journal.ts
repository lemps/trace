import type { JournalRow } from "./types.ts";

// A workspace's journal as the renderer holds it: each row id once, at its
// highest revision, in order of first appearance (`seq`). Rows arrive from
// `load_journal` and from `agent-journal` events in any order and may repeat,
// so merging is idempotent and never lets an older revision win.

export interface Journal {
  byId: Readonly<Record<string, JournalRow>>;
  /** Every row, sorted by `seq`. A new array whenever anything changes. */
  rows: readonly JournalRow[];
}

export const EMPTY_JOURNAL: Journal = { byId: {}, rows: [] };

/** Merge `incoming` into `journal`. Returns `journal` itself when nothing changed. */
export function upsertRows(journal: Journal, incoming: readonly JournalRow[]): Journal {
  let byId: Record<string, JournalRow> | null = null;
  const addedIds: string[] = [];
  for (const row of incoming) {
    const current = (byId ?? journal.byId)[row.id];
    if (current && current.revision >= row.revision) continue;
    byId ??= { ...journal.byId };
    if (!current) addedIds.push(row.id);
    byId[row.id] = row;
  }
  if (!byId) return journal;
  const next = byId;
  const rows = journal.rows.map((r) => next[r.id] ?? r);
  const added = addedIds.map((id) => next[id]);
  if (added.length > 0) {
    const last = rows[rows.length - 1];
    const inOrder = added.every(
      (r, i) => r.seq >= (i === 0 ? (last?.seq ?? -1) : added[i - 1].seq)
    );
    rows.push(...added);
    if (!inOrder) rows.sort((a, b) => a.seq - b.seq);
  }
  return { byId: next, rows };
}
