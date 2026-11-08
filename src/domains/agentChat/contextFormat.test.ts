// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contextLabel, contextPercent, contextTitle } from "./contextFormat.ts";
import { formatTokens } from "./format.ts";

const c = (used: number, window: number, estimated = false) => ({ used, window, estimated });

describe("context gauge", () => {
  it("formats token counts the header shows", () => {
    assert.equal(formatTokens(340_000), "340k");
    assert.equal(formatTokens(1_000_000), "1M");
    assert.equal(formatTokens(200_000), "200k");
    assert.equal(formatTokens(258_400), "258k");
  });

  it("reads as a rounded, clamped percentage", () => {
    assert.equal(contextPercent(c(340_000, 1_000_000)), 34);
    assert.equal(contextPercent(c(199_999, 200_000)), 100);
    assert.equal(contextPercent(c(300_000, 200_000)), 100);
    assert.equal(contextPercent(c(10, 0)), 0);
    assert.equal(contextLabel(c(340_000, 1_000_000)), "34%");
    assert.equal(contextLabel(c(3_000, 1_000_000)), "<1%");
    assert.equal(contextLabel(c(0, 1_000_000)), "0%");
  });

  it("says what it counts, and when the window is a guess", () => {
    assert.equal(contextTitle(c(340_000, 1_000_000)), "Context: 340k of 1M tokens used");
    assert.equal(
      contextTitle(c(30_000, 200_000, true)),
      "Context: 30k of 200k tokens used\nThe window size is estimated from the model."
    );
  });

  it("says compaction is automatic near the top", () => {
    const title = contextTitle(c(850_000, 1_000_000), "claude");
    assert.match(title, /Claude Code compacts the conversation automatically/);
    assert.doesNotMatch(contextTitle(c(500_000, 1_000_000), "claude"), /compacts/);
    assert.match(contextTitle(c(240_000, 258_400), "codex"), /^Context: 240k of 258k.*\nCodex/s);
  });
});
