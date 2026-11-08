import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RECENTS_DELAY, parseRecentsDelay } from "./recentsDelay.ts";

test("the recents delay defaults to two seconds", () => {
  assert.equal(DEFAULT_RECENTS_DELAY, 2000);
  assert.equal(parseRecentsDelay(null), 2000);
});

test("a stored offered wait is kept, anything else falls back", () => {
  assert.equal(parseRecentsDelay("0"), 0);
  assert.equal(parseRecentsDelay("500"), 500);
  assert.equal(parseRecentsDelay("3000"), 3000);
  assert.equal(parseRecentsDelay("750"), 2000);
  assert.equal(parseRecentsDelay("-1"), 2000);
  assert.equal(parseRecentsDelay("soon"), 2000);
  assert.equal(parseRecentsDelay(""), 2000);
});
