// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { subagentTurn } from "./dev/fixtureSubagents.ts";
import { EMPTY_JOURNAL, upsertRows } from "./journal.ts";
import { isPending, buildChat as project, runningSubagents } from "./projection.ts";
import type { JournalBody, JournalRow, Subagent } from "./types.ts";

let seq = 0;
const r = (id: string, body: JournalBody, turnId = "t1", revision = 0): JournalRow => ({
  id,
  revision,
  seq: ++seq,
  at: seq * 1000,
  turnId,
  body,
});
const user = (id: string, text: string, turnId = "t1") =>
  r(id, { kind: "message", role: "user", text, streaming: false }, turnId);
const say = (id: string, text: string, parentCallId?: string, turnId = "t1") =>
  r(id, { kind: "message", role: "assistant", text, streaming: false, parentCallId }, turnId);
const sub = (state: Subagent["state"], more: Partial<Subagent> = {}): Subagent => ({
  agentType: "Explore",
  background: false,
  state,
  ...more,
});
const agent = (id: string, callId: string, s: Subagent, turnId = "t1", revision = 0) =>
  r(
    id,
    {
      kind: "tool",
      callId,
      name: "Agent",
      input: { description: `job ${callId}`, prompt: `Do ${callId}.`, subagent_type: "Explore" },
      state: s.state === "running" ? "running" : "completed",
      subagent: s,
    },
    turnId,
    revision
  );
const call = (id: string, callId: string, parentCallId: string, name = "Glob") =>
  r(id, {
    kind: "tool",
    callId,
    parentCallId,
    name,
    input: { pattern: `${callId}/**` },
    state: "completed",
    output: "x",
  });
const ended = (id: string, turnId = "t1") =>
  r(id, { kind: "turn", turnId, state: "completed", durationMs: 1 });
const ids = (items: { row: JournalRow }[]) => items.map((i) => i.row.id);
/** As the store holds them: one row per id, at its latest revision, keeping its first `seq`. */
const buildChat = (rows: JournalRow[]) => {
  const first = new Map<string, number>();
  for (const row of rows) if (!first.has(row.id)) first.set(row.id, row.seq);
  const kept = rows.map((row) => ({ ...row, seq: first.get(row.id) ?? row.seq }));
  return project(upsertRows(EMPTY_JOURNAL, kept).rows);
};

describe("subagents", () => {
  // Two subagents in parallel: their rows interleave, as Claude sends them.
  const parallel = () => [
    user("u", "two at once"),
    agent("A", "a", sub("running")),
    agent("B", "b", sub("running")),
    call("a1", "a1", "a"),
    call("b1", "b1", "b"),
    say("b-said", "b is reading", "b"),
    call("a2", "a2", "a", "Read"),
    call("b2", "b2", "b", "Grep"),
  ];

  it("shows two parallel subagents as two cards in the timeline, each with its own rows", () => {
    const { turns, subagents } = buildChat(parallel());
    assert.deepEqual(ids(turns[0].items), ["A", "B"]);
    assert.deepEqual(
      subagents.map((s) => [s.callId, ids(s.items)]),
      [
        ["a", ["a1", "a2"]],
        ["b", ["b1", "b-said", "b2"]],
      ]
    );
    const [a, b] = subagents;
    assert.equal(a.label, "job a");
    assert.equal(a.brief, "Do a.");
    assert.equal(a.toolCount, 2);
    assert.equal(b.toolCount, 2);
    assert.match(a.activity, /^Read/);
    assert.equal(runningSubagents({ turns, subagents }), 2);
  });

  it("says each one's latest step while it runs", () => {
    const { subagents } = buildChat([...parallel(), say("a-said", "Checking the folder", "a")]);
    assert.equal(subagents[0].activity, "Checking the folder");
    assert.match(subagents[1].activity, /^Search/);
  });

  it("changes only the card whose subagent moved", () => {
    const before = buildChat(parallel());
    const after = buildChat([...parallel(), call("a3", "a3", "a")]);
    const [aBefore, bBefore] = before.turns[0].items;
    const [aAfter, bAfter] = after.turns[0].items;
    assert.ok(aAfter.version > aBefore.version);
    assert.equal(bAfter.version, bBefore.version);
    assert.ok(after.turns[0].version > before.turns[0].version);
  });

  it("ends with each report, and the card stays put when the turn folds", () => {
    const rows = [
      ...parallel(),
      agent("A", "a", sub("completed", { result: "a: 2 files", durationMs: 4000 }), "t1", 1),
      agent("B", "b", sub("failed"), "t1", 1),
      say("ans", "Both done."),
      ended("e"),
    ];
    const { turns, subagents } = buildChat(rows);
    const [a, b] = subagents;
    assert.equal(a.status, "done");
    assert.equal(a.result, "a: 2 files");
    assert.equal(a.durationMs, 4000);
    assert.equal(b.status, "failed");
    // Folding takes the agent's words along the way, never a subagent's card.
    assert.deepEqual(ids(turns[0].shown), ["A", "B", "ans"]);
    assert.equal(runningSubagents({ turns, subagents }), 0);
  });

  it("files a background subagent's later rows on its card, not the turn they land in", () => {
    const rows = [
      user("u", "start one in the background"),
      agent("bg", "g", sub("running", { background: true })),
      say("ok", "started"),
      ended("e"),
      user("u2", "something else", "t2"),
      say("a2", "sure", undefined, "t2"),
      call("g1", "g1", "g"),
      say("g-said", "found it", "g"),
    ];
    const before = buildChat(rows.slice(0, 6));
    const { turns, subagents } = buildChat(rows);
    assert.deepEqual(ids(turns[1].items), ["a2"]);
    assert.deepEqual(ids(subagents[0].items), ["g1", "g-said"]);
    assert.ok(turns[0].version > before.turns[0].version);
    assert.equal(turns[1].version, before.turns[1].version);
    assert.equal(subagents[0].status, "running");
    assert.ok(subagents[0].background);
    // Its turn is over and folded, but its card isn't.
    assert.ok(turns[0].shown.some((i) => i.row.id === "bg"));
  });

  it("finishes a background subagent in place after its turn", () => {
    const rows = [
      user("u", "start one in the background"),
      agent("bg", "g", sub("running", { background: true })),
      say("ok", "started"),
      ended("e"),
      call("g1", "g1", "g"),
      say("g-said", "found it", "g"),
      agent("bg", "g", sub("completed", { background: true }), "t1", 1),
    ];
    const [s] = buildChat(rows).subagents;
    assert.equal(s.status, "done");
    // No report from the agent: its last words are.
    assert.equal(s.result, "found it");
  });

  it("holds a subagent's open permission on its card, and keeps it out of the fold", () => {
    const rows = [
      user("u", "x"),
      agent("A", "a", sub("running")),
      r("k", {
        kind: "tool",
        callId: "k1",
        parentCallId: "a",
        name: "Bash",
        input: { command: "rm x" },
        state: "running",
      }),
      r("ask", {
        kind: "approval",
        requestId: "q",
        callId: "k1",
        tool: "Bash",
        title: "Run rm x",
        options: [],
      }),
    ];
    const { turns, subagents } = buildChat(rows);
    assert.ok(subagents[0].pending);
    assert.ok(isPending(turns[0].items[0]));
    const [k] = subagents[0].items;
    assert.ok(k.type === "tool" && k.approval?.row.id === "ask");
  });

  it("gives a subagent's tab its thinking, words, calls and their diffs", () => {
    const { subagents } = buildChat(subagentTurn());
    const fix = subagents.find((s) => s.description === "Fix parseRank");
    assert.ok(fix);
    const kinds = fix.items.map((i) =>
      i.type === "tool" ? `${i.call.name}${i.diffs.length ? "+diff" : ""}` : i.type
    );
    assert.deepEqual(kinds, ["message", "Read", "Edit+diff", "Bash", "message"]);
    assert.equal(fix.label, "Fix parseRank");
    assert.match(fix.result ?? "", /Infinity/);
    const auth = subagents.find((s) => s.agentType === "Explore" && !s.background);
    assert.ok(
      auth && auth.items[0].type === "message" && auth.items[0].message.role === "reasoning"
    );
    const bg = subagents.find((s) => s.background);
    assert.ok(bg);
    assert.deepEqual(ids(bg.items), ["s3t1"]);
  });

  it("recognises a launcher by name, or by rows naming it, in older journals", () => {
    const rows = [
      user("u", "x"),
      r("t", { kind: "tool", callId: "t", name: "Task", input: {}, state: "completed" }),
      r("o", { kind: "tool", callId: "o", name: "Other", input: {}, state: "completed" }),
      call("o1", "o1", "o"),
    ];
    const { subagents } = buildChat(rows);
    assert.deepEqual(
      subagents.map((s) => [s.callId, s.status]),
      [
        ["t", "done"],
        ["o", "done"],
      ]
    );
  });
});
