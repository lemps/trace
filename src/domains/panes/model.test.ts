// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { insertionIndex, resolveDropZone } from "./dropZone.ts";
import {
  allTabs,
  canSplit,
  closeGroup,
  cycleFocus,
  focusedGroup,
  groupOf,
  isArranged,
  listGroups,
  MAX_GROUPS,
  minSize,
  moveTab,
  moveToNextGroup,
  openBeside,
  type PaneLayout,
  removeTab,
  selectTab,
  setRatio,
  singleGroup,
  splitTab,
  visibleTabs,
} from "./model.ts";

const TABS = ["chat", "html", "files", "terminal"];
const base = () => singleGroup(TABS);

/** chat | files over terminal — the two-level layout the view supports. */
function twoLevel(): PaneLayout {
  const right = splitTab(base(), "files", "g1", "right");
  return splitTab(right, "terminal", "g1", "bottom");
}

describe("split", () => {
  it("moves a tab into a new pane beside its group, focused", () => {
    const l = splitTab(base(), "files", "g1", "right");
    assert.equal(l.root.kind, "split");
    if (l.root.kind !== "split") return;
    assert.equal(l.root.dir, "row");
    assert.deepEqual(l.root.first.kind === "group" && l.root.first.tabs, [
      "chat",
      "html",
      "terminal",
    ]);
    assert.deepEqual(l.root.second.kind === "group" && l.root.second.tabs, ["files"]);
    assert.equal(focusedGroup(l).active, "files");
    // The pane it left still shows what it showed.
    assert.deepEqual(visibleTabs(l), ["chat", "files"]);
  });

  it("puts left and top splits first", () => {
    const l = splitTab(base(), "terminal", "g1", "top");
    assert.ok(l.root.kind === "split" && l.root.dir === "column");
    assert.deepEqual(visibleTabs(l), ["terminal", "chat"]);
  });

  it("nests: chat | files over terminal", () => {
    const l = twoLevel();
    assert.equal(listGroups(l.root).length, 3);
    assert.deepEqual(visibleTabs(l), ["chat", "terminal", "files"]);
    assert.ok(l.root.kind === "split" && l.root.first.kind === "split");
  });

  it("won't split a group's only tab off itself", () => {
    const l = splitTab(base(), "files", "g1", "right");
    assert.equal(canSplit(l, "files", "g2"), false);
    assert.equal(splitTab(l, "files", "g2", "bottom"), l);
  });

  it("splitting a lone tab beside another group moves it there", () => {
    const l = splitTab(splitTab(base(), "files", "g1", "right"), "files", "g1", "bottom");
    assert.equal(listGroups(l.root).length, 2);
    assert.ok(l.root.kind === "split" && l.root.dir === "column");
  });

  it("stops at the group cap", () => {
    let l = singleGroup([...TABS, "tests"]);
    for (const t of ["html", "files", "terminal"]) l = splitTab(l, t, "g1", "right");
    assert.equal(listGroups(l.root).length, MAX_GROUPS);
    assert.equal(canSplit(l, "tests", "g2"), false);
    // A group's last tab can still go beside another: the count stays the same.
    assert.equal(canSplit(l, "html", "g1"), true);
  });
});

describe("move", () => {
  it("reorders within a group", () => {
    assert.deepEqual(allTabs(moveTab(base(), "terminal", "g1", 0)), [
      "terminal",
      "chat",
      "html",
      "files",
    ]);
    assert.deepEqual(allTabs(moveTab(base(), "chat", "g1", 3)), [
      "html",
      "files",
      "chat",
      "terminal",
    ]);
    assert.deepEqual(allTabs(moveTab(base(), "chat", "g1")), ["html", "files", "terminal", "chat"]);
  });

  it("moves between groups and shows the tab there", () => {
    const l = moveTab(splitTab(base(), "files", "g1", "right"), "terminal", "g2", 0);
    const right = listGroups(l.root)[1];
    assert.deepEqual(right.tabs, ["terminal", "files"]);
    assert.equal(right.active, "terminal");
    assert.equal(l.focused, right.id);
  });

  it("merges back when a move empties a group", () => {
    const l = moveTab(splitTab(base(), "files", "g1", "right"), "files", "g1");
    assert.equal(l.root.kind, "group");
    assert.deepEqual(allTabs(l), ["chat", "html", "terminal", "files"]);
  });

  it("collapses a nested split when its group empties", () => {
    const l = moveTab(twoLevel(), "terminal", "g2");
    assert.equal(listGroups(l.root).length, 2);
    assert.ok(l.root.kind === "split" && l.root.first.kind === "group");
  });

  it("moves to the next group, or splits right when there's one", () => {
    const one = moveToNextGroup(base(), "chat");
    assert.deepEqual(visibleTabs(one), ["html", "chat"]);
    const back = moveToNextGroup(one, "chat");
    assert.equal(back.root.kind, "group");
  });

  it("selecting a tab shows it in its own group and focuses that", () => {
    const l = selectTab(splitTab(base(), "files", "g1", "right"), "terminal");
    assert.equal(l.focused, "g1");
    assert.deepEqual(visibleTabs(l), ["terminal", "files"]);
  });
});

describe("close", () => {
  it("merges a closed pane's tabs into its neighbour, which keeps its view", () => {
    const l = closeGroup(splitTab(base(), "files", "g1", "right"), "g2");
    assert.equal(l.root.kind, "group");
    assert.deepEqual(allTabs(l), ["chat", "html", "terminal", "files"]);
    assert.deepEqual(visibleTabs(l), ["chat"]);
  });

  it("closing a first child merges into the nearest group of the second", () => {
    const l = closeGroup(twoLevel(), "g1");
    const groups = listGroups(l.root);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups[0].tabs, ["terminal", "chat", "html"]);
  });

  it("leaves the only pane alone", () => {
    const l = base();
    assert.equal(closeGroup(l, "g1"), l);
  });
});

describe("focus and size", () => {
  it("cycles focus in reading order, wrapping", () => {
    const l = twoLevel();
    const order = [l.focused];
    let at = l;
    for (let i = 0; i < 3; i++) {
      at = cycleFocus(at, 1);
      order.push(at.focused);
    }
    assert.deepEqual(order, ["g3", "g2", "g1", "g3"]);
    assert.equal(cycleFocus(l, -1).focused, "g1");
  });

  it("clamps ratios", () => {
    const l = splitTab(base(), "files", "g1", "right");
    const id = l.root.id;
    const set = setRatio(l, id, 2);
    assert.ok(set.root.kind === "split" && set.root.ratio === 0.9);
  });

  it("adds up minimum sizes along each split", () => {
    assert.deepEqual(minSize(twoLevel().root, 300, 160), { w: 600, h: 320 });
  });
});

describe("drop zones", () => {
  const rect = { left: 0, top: 0, width: 400, height: 200 };
  it("splits near an edge and joins in the middle", () => {
    assert.equal(resolveDropZone(rect, 20, 100), "left");
    assert.equal(resolveDropZone(rect, 390, 100), "right");
    assert.equal(resolveDropZone(rect, 200, 10), "top");
    assert.equal(resolveDropZone(rect, 200, 190), "bottom");
    assert.equal(resolveDropZone(rect, 200, 100), "center");
    assert.equal(resolveDropZone({ ...rect, width: 0 }, 0, 0), "center");
  });

  it("inserts before the tab under the pointer's left half", () => {
    const tabs = [
      { left: 0, width: 50 },
      { left: 50, width: 50 },
    ];
    assert.equal(insertionIndex(tabs, 10), 0);
    assert.equal(insertionIndex(tabs, 30), 1);
    assert.equal(insertionIndex(tabs, 99), 2);
  });
});

describe("optional panels", () => {
  it("open beside their owner's tab, and show if already open", () => {
    const l = openBeside(base(), "sub:a:1", "chat", "right");
    assert.deepEqual(visibleTabs(l), ["chat", "sub:a:1"]);
    assert.equal(openBeside(l, "sub:a:1", "chat", "right").focused, l.focused);
  });

  it("join the owner's group at the cap, and close cleanly", () => {
    let l = singleGroup([...TABS, "tests"]);
    for (const t of ["html", "files", "terminal"]) l = splitTab(l, t, "g1", "right");
    const full = openBeside(l, "sub:a:1", "chat", "right");
    assert.equal(listGroups(full.root).length, MAX_GROUPS);
    assert.ok(groupOf(full, "sub:a:1")?.tabs.includes("chat"));
    const opened = openBeside(base(), "sub:a:1", "chat", "right");
    assert.equal(removeTab(opened, "sub:a:1").root.kind, "group");
  });
});

describe("arranged", () => {
  it("counts splits, reorders and optional panels, not picking a tab", () => {
    assert.equal(isArranged(selectTab(base(), "files"), TABS), false);
    assert.equal(isArranged(moveTab(base(), "chat", "g1"), TABS), true);
    assert.equal(isArranged(splitTab(base(), "files", "g1", "right"), TABS), true);
    assert.equal(isArranged(singleGroup([...TABS, "sub:a:1"]), TABS), true);
  });
});
