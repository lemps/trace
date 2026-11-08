// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_ROWS } from "./dev/fixture.ts";
import { failedCount, workSentence } from "./format.ts";
import { buildTurns, isPending, isTurnLive } from "./projection.ts";
import type { JournalBody, JournalRow } from "./types.ts";

let seq = 0;
const r = (id: string, body: JournalBody, turnId?: string, revision = 0): JournalRow => ({
  id,
  revision,
  seq: ++seq,
  at: seq,
  turnId,
  body,
});
const user = (id: string, text: string, turnId?: string) =>
  r(id, { kind: "message", role: "user", text, streaming: false }, turnId);
const say = (id: string, text: string, turnId?: string) =>
  r(id, { kind: "message", role: "assistant", text, streaming: false }, turnId);
const tool = (id: string, callId: string, turnId?: string, parentCallId?: string) =>
  r(
    id,
    {
      kind: "tool",
      callId,
      name: "Bash",
      input: { command: "ls" },
      state: "completed",
      parentCallId,
    },
    turnId
  );
const done = (id: string, turnId: string) =>
  r(id, { kind: "turn", turnId, state: "completed", durationMs: 1000 });
const ids = (items: { row: JournalRow }[]) => items.map((i) => i.row.id);

describe("buildTurns", () => {
  it("groups rows into turns by turn id", () => {
    const turns = buildTurns([
      user("u1", "hi", "t1"),
      say("a1", "yo", "t1"),
      done("e1", "t1"),
      user("u2", "again", "t2"),
    ]);
    assert.deepEqual(
      turns.map((t) => [t.id, t.prompts.length, t.state]),
      [
        ["t1", 1, "completed"],
        ["t2", 1, "open"],
      ]
    );
  });

  it("binds a prompt without a turn id to the turn that follows", () => {
    const turns = buildTurns([user("u1", "hi"), say("a1", "yo", "t1"), done("e1", "t1")]);
    assert.equal(turns.length, 1);
    assert.equal(turns[0].prompts[0].row.id, "u1");
    assert.equal(turns[0].state, "completed");
  });

  it("starts a new turn for each prompt without ids", () => {
    const turns = buildTurns([user("u1", "a"), say("a1", "b"), user("u2", "c")]);
    assert.equal(turns.length, 2);
  });

  it("pairs approvals and diffs with their tool call, even when they come first", () => {
    const approval = r(
      "p",
      {
        kind: "approval",
        requestId: "q",
        callId: "c1",
        tool: "Bash",
        title: "Run ls",
        options: [],
      },
      "t1"
    );
    const diff = r(
      "d",
      { kind: "diff", callId: "c1", path: "a", change: "edit", patch: "@@\n-a\n+b" },
      "t1"
    );
    const turns = buildTurns([user("u", "x", "t1"), approval, tool("tl", "c1", "t1"), diff]);
    const items = turns[0].items;
    assert.equal(items.length, 1);
    const [item] = items;
    assert.ok(item.type === "tool" && item.approval?.row.id === "p" && item.diffs.length === 1);
    assert.ok(isPending(item));
  });

  it("keeps a subagent's calls out of the timeline, on the call that started it", () => {
    const turns = buildTurns([
      user("u", "x", "t1"),
      tool("p", "c1", "t1"),
      tool("k", "c2", "t1", "c1"),
    ]);
    assert.deepEqual(ids(turns[0].items), ["p"]);
    const [parent] = turns[0].items;
    assert.ok(parent.type === "tool" && parent.subagent !== null);
    assert.deepEqual(ids(parent.subagent.items), ["k"]);
  });

  it("re-renders a subagent's parent and its turn when the child's approval lands", () => {
    const base = [user("u", "x", "t1"), tool("p", "c1", "t1"), tool("k", "c2", "t1", "c1")];
    const ask = r(
      "a",
      { kind: "approval", requestId: "q", callId: "c2", tool: "Bash", title: "ls", options: [] },
      "t1"
    );
    const before = buildTurns(base)[0];
    const after = buildTurns([...base, ask])[0];
    assert.ok(after.items[0].version > before.items[0].version);
    assert.ok(after.version > before.version);
  });

  it("re-renders the earlier turn a background subagent's call lands in", () => {
    const base = [
      user("u", "x", "t1"),
      tool("p", "c1", "t1"),
      done("e", "t1"),
      user("u2", "y", "t2"),
    ];
    const before = buildTurns(base);
    const after = buildTurns([...base, tool("k", "c2", "t2", "c1")]);
    assert.ok(after[0].version > before[0].version);
    assert.equal(after[1].version, before[1].version);
  });

  it("folds a finished turn's work behind its final answer", () => {
    const [turn] = buildTurns([
      user("u", "x", "t1"),
      say("a0", "looking", "t1"),
      tool("t", "c1", "t1"),
      r("s", { kind: "status", text: "boom", tone: "error" }, "t1"),
      say("a1", "answer", "t1"),
      done("e", "t1"),
    ]);
    assert.deepEqual(ids(turn.folded), ["a0", "t"]);
    assert.deepEqual(ids(turn.shown), ["s", "a1"]);
  });

  it("doesn't fold a running turn, or one with no answer", () => {
    const running = buildTurns([user("u", "x", "t1"), tool("t", "c1", "t1"), say("a", "y", "t1")]);
    assert.equal(running[0].folded.length, 0);
    assert.ok(isTurnLive(running[0]));
    const silent = buildTurns([user("u", "x", "t1"), tool("t", "c1", "t1"), done("e", "t1")]);
    assert.equal(silent[0].folded.length, 0);
  });

  it("grows a turn's version when a row changes", () => {
    const a = buildTurns([user("u", "x", "t1"), say("a", "y", "t1")]);
    const b = buildTurns([user("u", "x", "t1"), { ...say("a", "yz", "t1"), revision: 1 }]);
    assert.ok(b[0].version > a[0].version);
  });

  it("projects the fixture: every kind, open prompts kept out of the fold", () => {
    const turns = buildTurns(FIXTURE_ROWS);
    assert.deepEqual(
      turns.map((t) => t.state),
      ["completed", "completed", "completed", "interrupted", "failed", "completed", "open"]
    );
    assert.ok(turns[1].folded.length > 5);
    assert.ok(turns[4].shown.some((i) => i.type === "status"));
    const live = turns[6];
    assert.ok(live.items.some((i) => i.type === "question" && isPending(i)));
    assert.ok(live.items.some((i) => i.type === "tool" && i.approval !== null && isPending(i)));
    assert.match(workSentence(turns[1].folded), /edited/);
  });
});

describe("workSentence", () => {
  it("counts each edited file once, however many calls and diffs touched it", () => {
    const turns = buildTurns(FIXTURE_ROWS);
    assert.equal(
      workSentence(turns[1].folded),
      "Updated the tasks, ran 2 commands and edited 3 files"
    );
  });
});

describe("failedCount", () => {
  it("counts the folded calls that failed", () => {
    const [turn] = buildTurns(FIXTURE_ROWS).filter((t) => t.folded.length > 0);
    const tools = turn.folded.filter((i) => i.type === "tool");
    assert.ok(tools.length >= 2);
    assert.equal(failedCount(turn.folded), 0);
    const marked = turn.folded.map((i) =>
      i.type === "tool" && tools.indexOf(i) < 2
        ? { ...i, call: { ...i.call, state: "failed" as const } }
        : i
    );
    assert.equal(failedCount(marked), 2);
  });
});
