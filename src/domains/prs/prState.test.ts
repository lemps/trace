// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { test } from "node:test";
import { prStateLabel } from "./prState.ts";

test("PR states read as words", () => {
  assert.equal(prStateLabel("open"), "Open");
  assert.equal(prStateLabel("draft"), "Draft");
  assert.equal(prStateLabel("MERGED"), "Merged");
  assert.equal(prStateLabel("declined"), "Closed");
});

test("an unknown state is capitalised, not dropped", () => {
  assert.equal(prStateLabel("queued"), "Queued");
  assert.equal(prStateLabel(""), "");
});
