import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RECENTS_FLYOUT, parseRecentsFlyout } from "./recentsFlyout.ts";

test("the recent sessions flyout is off by default", () => {
  assert.equal(DEFAULT_RECENTS_FLYOUT, false);
  assert.equal(parseRecentsFlyout(null), false);
});

test("only a stored 'on' turns it on", () => {
  assert.equal(parseRecentsFlyout("on"), true);
  assert.equal(parseRecentsFlyout("off"), false);
  assert.equal(parseRecentsFlyout("true"), false);
  assert.equal(parseRecentsFlyout(""), false);
});
