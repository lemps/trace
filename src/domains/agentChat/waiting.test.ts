// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JournalRow } from "./types.ts";
import { isWaitingOnYou, openPrompts } from "./waiting.ts";

let seq = 0;
const r = (id: string, body: JournalRow["body"]): JournalRow => ({
  id,
  revision: 0,
  seq: ++seq,
  at: seq,
  turnId: "t1",
  body,
});

const user = r("u", { kind: "message", role: "user", text: "go", streaming: false });
const approval = (resolved: boolean) =>
  r("a", {
    kind: "approval",
    requestId: "p1",
    tool: "Bash",
    title: "ls",
    options: [{ id: "y", label: "Allow", kind: "allowOnce" }],
    resolution: resolved ? { state: "cancelled" } : undefined,
  });
const question = (resolved: boolean) =>
  r("q", {
    kind: "question",
    requestId: "q1",
    questions: [{ id: "x", text: "Which?", options: [], multiSelect: false, allowFreeText: true }],
    resolution: resolved
      ? { state: "answered", answer: { kind: "questions", answers: { x: ["A"] } } }
      : undefined,
  });

describe("waiting on you", () => {
  it("is false with no prompt in the conversation", () => {
    assert.equal(isWaitingOnYou([]), false);
    assert.equal(isWaitingOnYou([user]), false);
  });

  it("is true while an approval or a question is open", () => {
    assert.equal(isWaitingOnYou([user, approval(false)]), true);
    assert.equal(isWaitingOnYou([user, question(false)]), true);
  });

  it("is false once every prompt is answered or cancelled", () => {
    assert.equal(isWaitingOnYou([user, approval(true), question(true)]), false);
    assert.equal(isWaitingOnYou([user, approval(true), question(false)]), true);
  });

  it("agrees with the open prompts the Inbox lists", () => {
    const rows = [user, approval(false), question(true)];
    assert.equal(openPrompts(rows).length, 1);
    assert.equal(openPrompts(rows)[0]?.kind, "approval");
    assert.equal(isWaitingOnYou(rows), openPrompts(rows).length > 0);
  });
});
