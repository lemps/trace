// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_LABELS, type FitItem, nextFit, solveFit } from "./tabFitSolve.ts";

/** A 100px tab that folds to 30px. */
const tab = (id: string, early = false): FitItem => ({ tab: id, full: 100, icon: 30, early });
const room = (avail: number) => ({ avail, more: 50, gap: 0 });

// An agent, three of its subagents, then the workspace's tabs.
const row = [
  tab("claude"),
  tab("s1", true),
  tab("s2", true),
  tab("s3", true),
  tab("files"),
  tab("term"),
];

describe("fitting a tab row", () => {
  it("keeps every label while they fit", () => {
    assert.deepEqual(solveFit(row, "claude", room(600)), ALL_LABELS);
  });

  it("folds one tab, not all of them, when it's just too wide", () => {
    assert.deepEqual(solveFit(row, "claude", room(590)), { icons: ["s1"], out: [] });
  });

  it("folds subagents first, oldest first, then the rest from the end", () => {
    assert.deepEqual(solveFit(row, "claude", room(460)).icons, ["s1", "s2"]);
    assert.deepEqual(solveFit(row, "claude", room(390)).icons, ["s1", "s2", "s3"]);
    assert.deepEqual(solveFit(row, "claude", room(320)).icons, ["s1", "s2", "s3", "term"]);
    assert.deepEqual(solveFit(row, "claude", room(250)).icons, ["s1", "s2", "s3", "files", "term"]);
  });

  it("folds the active tab last, even a subagent's", () => {
    assert.deepEqual(solveFit(row, "s1", room(590)).icons, ["s2"]);
    const all = solveFit(row, "s1", room(180));
    assert.deepEqual(all, { icons: ["claude", "s1", "s2", "s3", "files", "term"], out: [] });
  });

  it("sends subagents to the menu before the workspace's tabs", () => {
    // Six icons need 180; the menu's trigger takes 50 of what there is.
    assert.deepEqual(solveFit(row, "claude", room(170)).out, ["s1", "s2"]);
    assert.deepEqual(solveFit(row, "claude", room(140)).out, ["s1", "s2", "s3"]);
    assert.deepEqual(solveFit(row, "claude", room(110)).out, ["s1", "s2", "s3", "term"]);
  });

  it("never sends out the first tab or the active one", () => {
    const tiny = solveFit(row, "s2", room(60));
    assert.ok(!tiny.out.includes("claude"));
    assert.ok(!tiny.out.includes("s2"));
    assert.deepEqual(tiny.out, ["s1", "s3", "files", "term"]);
  });

  it("drops what belongs to a tab that's out", () => {
    const withSep: FitItem[] = [tab("a"), { of: "b", w: 10 }, tab("b", true), tab("c")];
    // Three icons and the rule need 100; without b and its rule, 60 beside the menu.
    assert.deepEqual(solveFit(withSep, "a", { avail: 95, more: 10, gap: 0 }).out, ["b"]);
  });

  it("takes spare room to unfold, so a width on the edge doesn't flicker", () => {
    const folded = { icons: ["s1"], out: [] };
    // Exactly enough for every label, but not the slack: stays as it was.
    assert.deepEqual(nextFit(row, "claude", room(600), folded, 4), folded);
    assert.deepEqual(nextFit(row, "claude", room(604), folded, 4), ALL_LABELS);
    // Folding further never waits.
    assert.deepEqual(nextFit(row, "claude", room(460), folded, 4).icons, ["s1", "s2"]);
  });

  it("starts over when the last fit names a tab that's gone", () => {
    const stale = { icons: ["gone"], out: ["also-gone"] };
    // It isn't kept, however tight it was: the row is fitted afresh.
    assert.deepEqual(nextFit(row, "claude", room(604), stale, 4), ALL_LABELS);
    assert.deepEqual(nextFit(row, "claude", room(460), stale, 4).icons, ["s1", "s2"]);
  });

  it("sends tabs with no icon straight to the menu, keeping every label", () => {
    // Settings' tabs: words only, as wide folded as not.
    const words = ["a", "b", "c", "d"].map(
      (id): FitItem => ({ tab: id, full: 100, icon: 100, early: false })
    );
    assert.deepEqual(solveFit(words, "a", room(400)), ALL_LABELS);
    // A pixel short: one tab leaves, the rest keep their words.
    assert.deepEqual(solveFit(words, "a", room(399)), { icons: [], out: ["d"] });
    // From the end, never the first or the active one.
    assert.deepEqual(solveFit(words, "d", room(260)), { icons: [], out: ["b", "c"] });
  });
});
