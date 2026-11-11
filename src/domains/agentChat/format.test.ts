// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callsSentence, formatDuration, turnEndText } from "./format.ts";

describe("formatDuration", () => {
  it("says seconds, minutes and hours", () => {
    assert.equal(formatDuration(4_000), "4s");
    assert.equal(formatDuration(90_000), "1m 30s");
    assert.equal(formatDuration(180_000), "3m");
    assert.equal(formatDuration(7_500_000), "2h 5m");
    assert.equal(formatDuration(-5), "0s");
  });
});

describe("turnEndText", () => {
  it("is the same line for the chat and the transcript", () => {
    assert.equal(turnEndText("completed", 192_000), "Worked 3m 12s");
    assert.equal(turnEndText("interrupted", 4_000), "Interrupted after 4s");
    assert.equal(turnEndText("failed"), "Failed");
    const usage = {
      inputTokens: 64_900,
      outputTokens: 5_900,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    assert.equal(turnEndText("completed", 4_000, usage), "Worked 4s · 65k in · 5.9k out");
  });
});

describe("callsSentence", () => {
  it("says what a run of calls did, in the chat's words", () => {
    const calls = [
      { name: "Read", input: { file_path: "/a.ts" } },
      { name: "Read", input: { file_path: "/b.ts" } },
      { name: "Bash", input: { command: "ls" } },
      { name: "Edit", input: { file_path: "/a.ts" } },
      { name: "MultiEdit", input: { file_path: "/a.ts" } },
      { name: "Grep", input: { pattern: "x" } },
    ];
    assert.equal(callsSentence(calls), "Read 2 files, ran 1 command, searched and edited 1 file");
    assert.equal(callsSentence([{ name: "TodoWrite", input: {} }]), "Updated the tasks");
    assert.equal(callsSentence([]), "");
  });
});
