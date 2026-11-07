// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfirmQueue, MAX_OPEN_PER_CALLER, type Timers } from "./confirmQueue.ts";
import { outcomeText } from "./repoRules.ts";

/** Timers fired by hand. */
function fakeTimers() {
  const due = new Map<number, () => void>();
  let next = 0;
  const timers: Timers = {
    set: (fn) => {
      next += 1;
      due.set(next, fn);
      return next;
    },
    clear: (h) => due.delete(h as number),
  };
  const fireAll = () => {
    for (const [h, fn] of [...due]) {
      due.delete(h);
      fn();
    }
  };
  return { timers, fireAll, pending: () => due.size };
}

const ask = (target = "C:\\repos\\demo", caller = "s1") => ({
  kind: "add" as const,
  target,
  detail: "",
  caller,
  callerLabel: "Parent session",
});

describe("repo confirm flow", () => {
  it("approve: runs the action once and hands the waiting call its result", async () => {
    const { timers, pending } = fakeTimers();
    const q = new ConfirmQueue(timers, () => 1);
    let runs = 0;
    const call = q.request(ask(), async () => `added ${++runs}`, 1000);
    assert.equal(q.open().length, 1, "the card is up");
    await q.answer(q.open()[0].id, true);
    assert.deepEqual(await call, { kind: "done", text: "added 1" });
    assert.equal(runs, 1);
    assert.equal(q.open().length, 0, "the card is gone");
    assert.equal(pending(), 0, "its timer is cleared");
  });

  it("deny: the action never runs and the call is told", async () => {
    const q = new ConfirmQueue(fakeTimers().timers);
    let ran = false;
    const call = q.request(
      ask(),
      async () => {
        ran = true;
        return "x";
      },
      1000
    );
    await q.answer(q.open()[0].id, false);
    const outcome = await call;
    assert.deepEqual(outcome, { kind: "denied" });
    assert.equal(ran, false);
    assert.match(outcomeText(outcome, "adding demo"), /declined adding demo/);
  });

  it("timeout: the call returns, the ask stays up, and a later ask gets the answer", async () => {
    const { timers, fireAll } = fakeTimers();
    const q = new ConfirmQueue(timers);
    const first = q.request(ask(), async () => "added", 1000);
    fireAll();
    const outcome = await first;
    assert.equal(outcome, "timeout");
    assert.match(outcomeText(outcome, "adding demo"), /Ask again later/);
    assert.equal(q.open().length, 1, "still waiting for the user");
    // The user approves while no call waits: it runs now, and is kept.
    await q.answer(q.open()[0].id, true);
    assert.equal(q.open().length, 0);
    assert.deepEqual(await q.request(ask(), async () => "again", 1000), {
      kind: "done",
      text: "added",
    });
    // Taken once: the next identical ask is a new one.
    void q.request(ask(), async () => "x", 1000);
    assert.equal(q.open().length, 1);
  });

  it("an identical ask joins the open one instead of stacking a second card", async () => {
    const q = new ConfirmQueue(fakeTimers().timers);
    const a = q.request(ask(), async () => "ok", 1000);
    const b = q.request(ask(), async () => "ok", 1000);
    assert.equal(q.open().length, 1);
    await q.answer(q.open()[0].id, true);
    assert.deepEqual(await a, { kind: "done", text: "ok" });
    assert.deepEqual(await b, { kind: "done", text: "ok" });
  });

  it("a failed action is an error for the agent, and one agent can't flood the user", async () => {
    const q = new ConfirmQueue(fakeTimers().timers);
    const call = q.request(
      ask(),
      async () => {
        throw new Error("not a git repository");
      },
      1000
    );
    await q.answer(q.open()[0].id, true);
    const outcome = await call;
    assert.throws(() => outcomeText(outcome, "x"), /not a git repository/);
    for (let i = 0; i < MAX_OPEN_PER_CALLER; i++)
      void q.request(ask(`C:\\r${i}`), async () => "", 1000);
    const over = await q.request(ask("C:\\one-more"), async () => "", 1000);
    assert.equal(typeof over === "object" && over.kind, "failed");
    assert.equal(q.open().length, MAX_OPEN_PER_CALLER);
    // Another agent still gets through.
    void q.request(ask("C:\\theirs", "s2"), async () => "", 1000);
    assert.equal(q.open().length, MAX_OPEN_PER_CALLER + 1);
  });
});
