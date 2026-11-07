// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_JOURNAL, upsertRows } from "./journal.ts";
import type { JournalRow } from "./types.ts";

const msg = (id: string, seq: number, revision: number, text: string): JournalRow => ({
  id,
  seq,
  revision,
  at: seq,
  body: { kind: "message", role: "assistant", text, streaming: revision < 2 },
});

describe("upsertRows", () => {
  it("adds rows in seq order", () => {
    const j = upsertRows(EMPTY_JOURNAL, [msg("b", 2, 0, "b"), msg("a", 1, 0, "a")]);
    assert.deepEqual(
      j.rows.map((r) => r.id),
      ["a", "b"]
    );
  });

  it("keeps the highest revision whatever the arrival order", () => {
    let j = upsertRows(EMPTY_JOURNAL, [msg("a", 1, 2, "final")]);
    j = upsertRows(j, [msg("a", 1, 1, "stale")]);
    const body = j.rows[0].body;
    assert.equal(body.kind === "message" && body.text, "final");
    j = upsertRows(j, [msg("a", 1, 3, "newer")]);
    assert.equal(j.rows.length, 1);
    assert.equal(j.byId.a.revision, 3);
  });

  it("returns the same journal when nothing changed", () => {
    const j = upsertRows(EMPTY_JOURNAL, [msg("a", 1, 1, "x")]);
    assert.equal(upsertRows(j, [msg("a", 1, 1, "x"), msg("a", 1, 0, "y")]), j);
  });

  it("takes a repeated new id once, at its latest revision", () => {
    const j = upsertRows(EMPTY_JOURNAL, [msg("a", 1, 0, "x"), msg("a", 1, 1, "xy")]);
    assert.equal(j.rows.length, 1);
    assert.equal(j.rows[0].revision, 1);
  });

  it("keeps a replaced row in place", () => {
    let j = upsertRows(EMPTY_JOURNAL, [msg("a", 1, 0, "a"), msg("b", 2, 0, "b")]);
    j = upsertRows(j, [msg("a", 1, 1, "a2"), msg("c", 3, 0, "c")]);
    assert.deepEqual(
      j.rows.map((r) => `${r.id}${r.revision}`),
      ["a1", "b0", "c0"]
    );
  });
});
