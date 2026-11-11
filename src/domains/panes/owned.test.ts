// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allTabs,
  groupOf,
  listGroups,
  moveTab,
  type PaneLayout,
  selectTab,
  singleGroup,
  splitTab,
  visibleTabs,
} from "./model.ts";
import {
  inRunOrder,
  type OwnedRun,
  openOwnedBeside,
  placeOwned,
  stepOrigin,
  stepRun,
  upFrom,
} from "./owned.ts";

const TABS = ["agent:a", "agent:b", "plan", "files"];
const runA = (...tabs: string[]): OwnedRun => ({ owner: "agent:a", tabs });
const runB = (...tabs: string[]): OwnedRun => ({ owner: "agent:b", tabs });
const tabsOf = (l: PaneLayout) => listGroups(l.root).map((g) => g.tabs);

describe("placeOwned", () => {
  it("puts a new subagent right after its agent, in start order", () => {
    const l = placeOwned(singleGroup(TABS), runA("s1", "s2"));
    assert.deepEqual(allTabs(l), ["agent:a", "s1", "s2", "agent:b", "plan", "files"]);
  });

  it("puts a later one after the earlier ones, not before them", () => {
    const one = placeOwned(singleGroup(TABS), runA("s1"));
    const two = placeOwned(one, runA("s1", "s2"));
    assert.deepEqual(allTabs(two), ["agent:a", "s1", "s2", "agent:b", "plan", "files"]);
  });

  it("never changes the shown tab or the focused pane", () => {
    const reading = selectTab(splitTab(singleGroup(TABS), "files", "g1", "right"), "agent:a");
    const l = placeOwned(reading, runA("s1"));
    assert.deepEqual(visibleTabs(l), visibleTabs(reading));
    assert.equal(l.focused, reading.focused);
  });

  it("leaves one already somewhere where it is", () => {
    const placed = placeOwned(singleGroup(TABS), runA("s1", "s2"));
    const dragged = splitTab(placed, "s1", "g1", "right");
    const l = placeOwned(dragged, runA("s1", "s2", "s3"));
    assert.deepEqual(groupOf(l, "s1")?.id, groupOf(dragged, "s1")?.id);
    // The new one follows the agent's run in the agent's pane.
    assert.deepEqual(groupOf(l, "s3")?.tabs, ["agent:a", "s2", "s3", "agent:b", "plan", "files"]);
  });

  it("goes after the rightmost of the run when the user reordered it", () => {
    const placed = placeOwned(singleGroup(TABS), runA("s1", "s2"));
    const reordered = moveTab(placed, "s1", "g1", "files");
    const l = placeOwned(reordered, runA("s1", "s2", "s3"));
    assert.deepEqual(allTabs(l), ["agent:a", "s2", "agent:b", "plan", "s1", "s3", "files"]);
  });

  it("keeps each agent's subagents with that agent", () => {
    let l = placeOwned(singleGroup(TABS), runA("s1"));
    l = placeOwned(l, runB("c1"));
    l = placeOwned(l, runA("s1", "s2"));
    assert.deepEqual(allTabs(l), ["agent:a", "s1", "s2", "agent:b", "c1", "plan", "files"]);
  });

  it("returns the same layout when there's nothing to place", () => {
    const l = placeOwned(singleGroup(TABS), runA("s1"));
    assert.equal(placeOwned(l, runA("s1")), l);
    assert.equal(placeOwned(l, { owner: "missing", tabs: ["x"] }), l);
  });
});

describe("openOwnedBeside", () => {
  const placed = () => placeOwned(singleGroup(TABS), runA("s1", "s2"));

  it("splits a subagent that shares its agent's pane off to the right, shown", () => {
    const l = openOwnedBeside(placed(), "s1", runA("s1", "s2"), "right");
    assert.deepEqual(tabsOf(l), [["agent:a", "s2", "agent:b", "plan", "files"], ["s1"]]);
    assert.equal(groupOf(l, "s1")?.id, l.focused);
  });

  it("puts a second one in the first one's pane, not halving the agent's again", () => {
    const first = openOwnedBeside(placed(), "s1", runA("s1", "s2"), "right");
    const l = openOwnedBeside(first, "s2", runA("s1", "s2"), "right");
    assert.equal(listGroups(l.root).length, 3);
    assert.deepEqual(groupOf(l, "agent:a")?.tabs, ["agent:a", "agent:b", "plan", "files"]);
  });

  it("only shows one that's already beside", () => {
    const first = openOwnedBeside(placed(), "s1", runA("s1", "s2"), "right");
    const away = selectTab(first, "agent:a");
    const l = openOwnedBeside(away, "s1", runA("s1", "s2"), "right");
    assert.deepEqual(tabsOf(l), tabsOf(away));
    assert.equal(l.focused, groupOf(l, "s1")?.id);
  });

  it("opens one not in the layout yet beside the agent", () => {
    const l = openOwnedBeside(singleGroup(TABS), "s1", runA("s1"), "right");
    assert.deepEqual(tabsOf(l), [TABS, ["s1"]]);
  });
});

describe("stepRun", () => {
  const runs = [runA("s1", "s2"), runB("c1")];
  const l = placeOwned(placeOwned(singleGroup(TABS), runs[0]), runs[1]);

  it("steps through an agent and its subagents in strip order, wrapping", () => {
    assert.equal(stepRun(l, runs, "agent:a", 1), "s1");
    assert.equal(stepRun(l, runs, "s2", 1), "agent:a");
    assert.equal(stepRun(l, runs, "agent:a", -1), "s2");
    assert.equal(stepRun(l, runs, "c1", 1), "agent:b");
  });

  it("does nothing outside a run, or in one with nothing else", () => {
    assert.equal(stepRun(l, runs, "files", 1), null);
    assert.equal(stepRun(singleGroup(TABS), [runA()], "agent:a", 1), null);
  });

  it("follows a subagent into the pane it was moved to", () => {
    const split = splitTab(l, "s1", "g1", "right");
    assert.equal(stepRun(split, runs, "s2", 1), "s1");
  });

  it("steps from the focused pane's tab, else the first pane showing a run", () => {
    assert.equal(stepOrigin(l, runs), "agent:a");
    const files = splitTab(l, "files", "g1", "right");
    assert.equal(stepOrigin(files, runs), "agent:a");
    assert.equal(stepOrigin(selectTab(l, "plan"), runs), null);
  });
});

describe("inRunOrder", () => {
  it("reads one row in the tabs' own order, each agent with its subagents", () => {
    const order = ["agent:a", "agent:b", "plan", "s1", "c1", "s2"];
    assert.deepEqual(inRunOrder(order, [runA("s1", "s2"), runB("c1")]), [
      "agent:a",
      "s1",
      "s2",
      "agent:b",
      "c1",
      "plan",
    ]);
  });
});

describe("upFrom", () => {
  const placed = placeOwned(singleGroup(TABS), runA("s1", "s2"));

  it("goes from a subagent's tab up to its agent's", () => {
    assert.equal(upFrom(selectTab(placed, "s2"), [runA("s1", "s2")]), "agent:a");
  });

  it("has nowhere to go from the agent's own tab, or a workspace tab", () => {
    assert.equal(upFrom(selectTab(placed, "agent:a"), [runA("s1", "s2")]), null);
    assert.equal(upFrom(selectTab(placed, "files"), [runA("s1", "s2")]), null);
  });

  it("leaves a subagent in a pane of its own alone", () => {
    const beside = splitTab(placed, "s1", "g1", "right");
    assert.equal(upFrom(beside, [runA("s1", "s2")]), null);
  });
});
