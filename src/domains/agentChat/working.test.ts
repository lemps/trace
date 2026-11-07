// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildChat } from "./projection.ts";
import type { JournalRow, SessionInfo } from "./types.ts";
import { isAgentWorking, isWorkingInfo } from "./working.ts";

const info = (busy: boolean, runningSubagents?: number): SessionInfo => ({
  agent: "claude",
  slashCommands: [],
  busy,
  limits: [],
  runningSubagents,
});

let seq = 0;
const r = (id: string, body: JournalRow["body"]): JournalRow => ({
  id,
  revision: 0,
  seq: ++seq,
  at: seq,
  turnId: "t1",
  body,
});
/** A finished turn that left a background subagent running. */
const backgroundLeft = () =>
  buildChat([
    r("u", { kind: "message", role: "user", text: "go", streaming: false }),
    r("bg", {
      kind: "tool",
      callId: "g",
      name: "Agent",
      input: {},
      state: "completed",
      subagent: { background: true, state: "running" },
    }),
    r("a", { kind: "message", role: "assistant", text: "started", streaming: false }),
    r("e", { kind: "turn", turnId: "t1", state: "completed" }),
  ]);

describe("working", () => {
  it("counts a turn, or subagents outliving theirs, as working", () => {
    assert.equal(isWorkingInfo(info(true, 0)), true);
    assert.equal(isWorkingInfo(info(false, 2)), true);
    assert.equal(isWorkingInfo(info(false, 0)), false);
    assert.equal(isWorkingInfo(undefined), false);
  });

  it("goes by what the agent reports over what the rows say", () => {
    const chat = backgroundLeft();
    // The agent says the background subagent ended (its row will follow).
    assert.equal(isAgentWorking(info(false, 0), chat), false);
    assert.equal(isAgentWorking(info(false, 1), chat), true);
  });

  it("reads the rows when the agent hasn't reported", () => {
    assert.equal(isAgentWorking(undefined, backgroundLeft()), true);
    assert.equal(isAgentWorking(undefined, buildChat([])), false);
  });
});
