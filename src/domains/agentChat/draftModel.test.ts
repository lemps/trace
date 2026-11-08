// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type Drafts, debounce, parseDrafts, pruneDrafts, withDraft } from "./draftModel.ts";

describe("withDraft", () => {
  it("starts, edits and stamps a workspace's draft", () => {
    let d: Drafts = {};
    d = withDraft(d, "w1", { text: "hel" }, 1);
    d = withDraft(d, "w1", { attachments: ["/a.png"] }, 2);
    assert.deepEqual(d, { w1: { text: "hel", attachments: ["/a.png"], at: 2 } });
  });

  it("removes a draft that's emptied, and leaves others alone", () => {
    const d: Drafts = {
      w1: { text: "x", attachments: [], at: 1 },
      w2: { text: "y", attachments: [], at: 1 },
    };
    assert.deepEqual(Object.keys(withDraft(d, "w1", { text: "  " }, 2)), ["w2"]);
  });

  it("returns the same object when nothing was there and nothing is added", () => {
    const d: Drafts = {};
    assert.equal(withDraft(d, "w1", { text: "" }, 1), d);
  });
});

describe("pruneDrafts", () => {
  it("keeps the newest", () => {
    const d: Drafts = {
      old: { text: "a", attachments: [], at: 1 },
      mid: { text: "b", attachments: [], at: 2 },
      new: { text: "c", attachments: [], at: 3 },
    };
    assert.deepEqual(Object.keys(pruneDrafts(d, 2)).sort(), ["mid", "new"]);
    assert.equal(pruneDrafts(d, 5), d);
  });
});

describe("parseDrafts", () => {
  it("keeps well-formed drafts and drops the rest", () => {
    const raw: unknown = {
      ok: { text: "hi", attachments: ["/f"], at: 3 },
      empty: { text: " ", attachments: [], at: 3 },
      badPaths: { text: "hi", attachments: [1], at: 3 },
      noAt: { text: "hi", attachments: [] },
      nope: "text",
    };
    assert.deepEqual(parseDrafts(raw), { ok: { text: "hi", attachments: ["/f"], at: 3 } });
  });

  it("reads junk as no drafts", () => {
    for (const raw of [null, 3, "x", [], undefined]) assert.deepEqual(parseDrafts(raw), {});
  });
});

describe("debounce", () => {
  /** Timers driven by hand: `tick()` fires whatever's pending. */
  function fakeTimers() {
    let pending: (() => void) | null = null;
    let sets = 0;
    return {
      timers: {
        set: (fn: () => void) => {
          sets += 1;
          pending = fn;
          return sets;
        },
        clear: () => {
          pending = null;
        },
      },
      tick: () => pending?.(),
      get sets() {
        return sets;
      },
    };
  }

  it("runs once after a burst of calls", () => {
    const t = fakeTimers();
    let runs = 0;
    const d = debounce(() => runs++, 400, t.timers);
    d.schedule();
    d.schedule();
    d.schedule();
    assert.equal(runs, 0);
    t.tick();
    assert.equal(runs, 1);
    assert.equal(t.sets, 3);
  });

  it("flushes a waiting run now, and only once", () => {
    const t = fakeTimers();
    let runs = 0;
    const d = debounce(() => runs++, 400, t.timers);
    d.flush();
    assert.equal(runs, 0);
    d.schedule();
    d.flush();
    d.flush();
    t.tick();
    assert.equal(runs, 1);
  });
});
