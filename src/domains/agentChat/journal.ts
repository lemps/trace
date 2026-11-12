import type { JournalRow } from "./types.ts";

// A workspace's journal as the renderer holds it: each row once, at its
// highest revision, in order of first appearance (`seq`). Rows arrive from
// `load_journal` and from `agent-journal` events in any order and may repeat,
// so merging is idempotent and never lets an older revision win.
//
// A row is identified by its id *and* its `seq`. An adapter retires a row it
// won't change again, and the id it had can come back on a later row, whose
// revisions start at 0 again (an agent whose stream events carry no message
// id puts every one of its messages on `msg::1`). Keyed by id alone, that new
// row reads as a stale copy of the retired one and is dropped — the agent
// answers and the conversation shows nothing. A revision only ever replaces
// the row it belongs to: same id, same seq.

export interface Journal {
  byKey: Readonly<Record<string, JournalRow>>;
  /** Every row, sorted by `seq`. A new array whenever anything changes. */
  rows: readonly JournalRow[];
}

/** A row's identity. The same id at a new `seq` is a new row, not a revision. */
export function rowKey(row: JournalRow): string {
  return `${row.seq}:${row.id}`;
}

export const EMPTY_JOURNAL: Journal = { byKey: {}, rows: [] };

/** Merge `incoming` into `journal`. Returns `journal` itself when nothing changed. */
export function upsertRows(journal: Journal, incoming: readonly JournalRow[]): Journal {
  let byKey: Record<string, JournalRow> | null = null;
  const addedKeys: string[] = [];
  for (const row of incoming) {
    const key = rowKey(row);
    const current = (byKey ?? journal.byKey)[key];
    if (current && current.revision >= row.revision) continue;
    byKey ??= { ...journal.byKey };
    if (!current) addedKeys.push(key);
    byKey[key] = row;
  }
  if (!byKey) return journal;
  const next = byKey;
  const rows = journal.rows.map((r) => next[rowKey(r)] ?? r);
  const added = addedKeys.map((key) => next[key]);
  if (added.length > 0) {
    const last = rows[rows.length - 1];
    const inOrder = added.every(
      (r, i) => r.seq >= (i === 0 ? (last?.seq ?? -1) : added[i - 1].seq)
    );
    rows.push(...added);
    if (!inOrder) rows.sort((a, b) => a.seq - b.seq);
  }
  return { byKey: next, rows };
}
