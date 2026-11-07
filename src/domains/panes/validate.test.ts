// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allTabs, listGroups, singleGroup, splitTab, visibleTabs } from "./model.ts";
import { hideTabs, normalizeLayout, parseLayout, type TabCatalog } from "./validate.ts";

const catalog = (fixed: string[], optional: string[] = []): TabCatalog => ({
  fixed,
  isOptional: (t) => optional.includes(t),
});
const TABS = ["agent:a", "html", "files", "terminal"];
const roundTrip = (v: unknown) => parseLayout(JSON.parse(JSON.stringify(v)));

describe("parseLayout", () => {
  it("reads back what was written", () => {
    const l = splitTab(singleGroup(TABS), "files", "g1", "right");
    assert.deepEqual(roundTrip(l), l);
  });

  it("refuses what isn't a layout", () => {
    for (const bad of [null, 3, "x", {}, { root: { kind: "nope", id: "g1" } }]) {
      assert.equal(parseLayout(bad), null);
    }
    const dupIds = {
      root: {
        kind: "split",
        id: "g1",
        dir: "row",
        ratio: 0.5,
        first: { kind: "group", id: "g1", tabs: ["a"], active: "a" },
        second: { kind: "group", id: "g2", tabs: ["b"], active: "b" },
      },
      focused: "g1",
    };
    assert.equal(parseLayout(dupIds), null);
  });

  it("drops non-string tabs and clamps ratios", () => {
    const l = parseLayout({
      root: {
        kind: "split",
        id: "s1",
        dir: "column",
        ratio: 7,
        first: { kind: "group", id: "g1", tabs: ["html", 4], active: "html" },
        second: { kind: "group", id: "g2", tabs: ["files"], active: "files" },
      },
      focused: "g2",
    });
    assert.ok(l && l.root.kind === "split");
    assert.equal(l.root.ratio, 0.9);
    assert.deepEqual(allTabs(l), ["html", "files"]);
  });

  it("refuses absurd nesting", () => {
    let node: unknown = { kind: "group", id: "g0", tabs: ["a"], active: "a" };
    for (let i = 1; i < 10; i++) {
      node = {
        kind: "split",
        id: `s${i}`,
        dir: "row",
        ratio: 0.5,
        first: node,
        second: { kind: "group", id: `g${i}`, tabs: ["b"], active: "b" },
      };
    }
    assert.equal(parseLayout({ root: node, focused: "g0" }), null);
  });
});

describe("normalizeLayout", () => {
  it("starts from one group of every tab", () => {
    assert.deepEqual(normalizeLayout(null, catalog(TABS)), singleGroup(TABS));
  });

  it("drops unknown and repeated tabs, and the groups they emptied", () => {
    const stored = splitTab(singleGroup([...TABS, "gone"]), "gone", "g1", "right");
    const l = normalizeLayout(stored, catalog(TABS));
    assert.equal(l.root.kind, "group");
    assert.deepEqual(allTabs(l), TABS);
    assert.equal(l.focused, "g1");

    const twice = singleGroup(["html", "html", "files"]);
    assert.deepEqual(allTabs(normalizeLayout(twice, catalog(["html", "files"]))), [
      "html",
      "files",
    ]);
  });

  it("puts missing tabs back beside the tab before them", () => {
    const stored = splitTab(singleGroup(TABS), "agent:a", "g1", "right");
    // A companion agent joined since: its tab follows the first agent's, in its pane.
    const l = normalizeLayout(stored, catalog(["agent:a", "agent:b", "html", "files", "terminal"]));
    assert.deepEqual(listGroups(l.root)[1].tabs, ["agent:a", "agent:b"]);
    // A missing first tab goes first in the first group.
    const first = normalizeLayout(singleGroup(["html"]), catalog(["agent:a", "html"]));
    assert.deepEqual(allTabs(first), ["agent:a", "html"]);
  });

  it("keeps optional tabs that are known, and shows a real tab", () => {
    const stored = splitTab(singleGroup([...TABS, "sub:a:1"]), "sub:a:1", "g1", "right");
    const kept = normalizeLayout(stored, catalog(TABS, ["sub:a:1"]));
    assert.deepEqual(visibleTabs(kept), ["agent:a", "sub:a:1"]);
    const dropped = normalizeLayout(stored, catalog(TABS));
    assert.equal(dropped.root.kind, "group");

    const badActive = { ...singleGroup(TABS), root: { ...singleGroup(TABS).root, active: "zzz" } };
    assert.deepEqual(visibleTabs(normalizeLayout(badActive, catalog(TABS))), ["agent:a"]);
  });
});

describe("a tab that comes and goes (Plan)", () => {
  const hidden = new Set(["html"]);
  const withHidden: TabCatalog = { ...catalog(TABS), hidden };

  it("isn't drawn while hidden, and its pane goes with it", () => {
    // Plan split off beside the chat, then emptied.
    const split = splitTab(singleGroup(TABS), "html", "g1", "right");
    const full = normalizeLayout(split, withHidden);
    const shown = hideTabs(full, hidden);
    assert.equal(listGroups(shown.root).length, 1);
    assert.deepEqual(allTabs(shown), ["agent:a", "files", "terminal"]);
    // The stored layout still has it in its own pane...
    assert.equal(listGroups(full.root).length, 2);
    // ...so when it's back, it's back there.
    const back = hideTabs(normalizeLayout(split, catalog(TABS)), new Set());
    assert.deepEqual(back, normalizeLayout(split, catalog(TABS)));
    assert.deepEqual(listGroups(back.root)[1].tabs, ["html"]);
  });

  it("keeps its place among the tabs of one pane", () => {
    const full = normalizeLayout(singleGroup(TABS), withHidden);
    assert.deepEqual(allTabs(full), TABS);
    assert.deepEqual(allTabs(hideTabs(full, hidden)), ["agent:a", "files", "terminal"]);
  });

  it("never leaves a pane showing it, or focus on a pane that's gone", () => {
    const l = { ...singleGroup(TABS), root: { ...singleGroup(TABS).root, active: "html" } };
    const full = normalizeLayout(l, withHidden);
    assert.equal(visibleTabs(full)[0], "agent:a");
    const split = splitTab(singleGroup(TABS), "html", "g1", "right");
    const focusedOnPlan = { ...split, focused: listGroups(split.root)[1].id };
    const shown = hideTabs(normalizeLayout(focusedOnPlan, withHidden), hidden);
    assert.equal(shown.focused, listGroups(shown.root)[0].id);
  });
});
