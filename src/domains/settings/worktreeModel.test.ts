// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CleanupItem } from "../../ipc/cleanup.ts";
import type { WorktreeInfo } from "../../ipc/worktrees.ts";
import {
  cleanupMarks,
  deleteCount,
  groupByRepo,
  removableMerged,
  worktreeName,
} from "./worktreeModel.ts";
import { worktreeRowMenu } from "./worktreeRowMenu.ts";

const UUID = "3f2a9c1e-0b7d-4c55-9e1a-2b3c4d5e6f70";

const wt = (repo: string, name: string, over: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
  repo,
  path: `${repo}/.worktrees/${name}`,
  name,
  branch: `workspace/${name}`,
  merged: false,
  dirty: false,
  running: false,
  owner: null,
  ...over,
});

const item = (path: string, held: string | null = null): CleanupItem => ({
  workspaceId: "x",
  kind: "session",
  label: "x",
  path,
  lastActive: 0,
  held,
});

describe("groupByRepo", () => {
  it("groups by repo in the order the listing names them", () => {
    const groups = groupByRepo([wt("/b", "one"), wt("/a", "two"), wt("/b", "three")]);
    assert.deepEqual(
      groups.map((g) => [g.repo, g.items.map((i) => i.name)]),
      [
        ["/b", ["one", "three"]],
        ["/a", ["two"]],
      ]
    );
  });

  it("has no groups for no worktrees", () => {
    assert.deepEqual(groupByRepo([]), []);
  });
});

describe("worktreeName", () => {
  it("uses the owner's name when trace knows it", () => {
    const owner = { kind: "session" as const, id: UUID, label: "Fix login" };
    assert.deepEqual(worktreeName({ name: UUID, owner }), { text: "Fix login" });
  });

  it("shortens a bare UUID, with the whole one as its title", () => {
    assert.deepEqual(worktreeName({ name: UUID, owner: null }), {
      text: "3f2a9c1e",
      title: UUID,
    });
  });

  it("leaves any other dir name alone", () => {
    assert.deepEqual(worktreeName({ name: "trace-12", owner: null }), { text: "trace-12" });
  });
});

describe("cleanupMarks", () => {
  const list = [wt("/r", "a"), wt("/r", "b"), wt("/s", "c")];

  it("marks what the next pass deletes and what it keeps, by path", () => {
    const marks = cleanupMarks(list, {
      items: [item("/r/.worktrees/a"), item("/r/.worktrees/b/", "it has uncommitted changes")],
    });
    assert.deepEqual(marks.get("/r/.worktrees/a"), { kind: "delete" });
    assert.deepEqual(marks.get("/r/.worktrees/b"), {
      kind: "kept",
      reason: "it has uncommitted changes",
    });
    assert.equal(marks.has("/s/.worktrees/c"), false);
  });

  it("falls back to the dir name when the path was resolved differently", () => {
    const marks = cleanupMarks(list, { items: [item("/private/s/.worktrees/c")] });
    assert.deepEqual(marks.get("/s/.worktrees/c"), { kind: "delete" });
  });

  it("doesn't guess when two worktrees share a dir name", () => {
    const twins = [wt("/r", "a"), wt("/s", "a")];
    assert.equal(cleanupMarks(twins, { items: [item("/other/.worktrees/a")] }).size, 0);
  });

  it("marks nothing without a report, and ignores items no longer listed", () => {
    assert.equal(cleanupMarks(list, null).size, 0);
    assert.equal(cleanupMarks(list, { items: [item("/gone/.worktrees/zz")] }).size, 0);
  });

  it("counts only what's deleted", () => {
    assert.equal(deleteCount({ items: [item("/a"), item("/b", "running"), item("/c")] }), 2);
    assert.equal(deleteCount(null), 0);
  });
});

describe("removableMerged", () => {
  it("is merged, clean and idle only", () => {
    const list = [
      wt("/r", "a", { merged: true }),
      wt("/r", "b", { merged: true, dirty: true }),
      wt("/r", "c", { merged: true, running: true }),
      wt("/r", "d"),
    ];
    assert.deepEqual(
      removableMerged(list).map((w) => w.name),
      ["a"]
    );
  });
});

describe("worktreeRowMenu", () => {
  const noop = () => {};
  const ids = (w: Pick<WorktreeInfo, "owner" | "running">) =>
    worktreeRowMenu({
      wt: w,
      onOpen: noop,
      onReveal: noop,
      onCopyPath: noop,
      onRemove: noop,
    }).map((s) => s.items.map((i) => [i.id, i.label, Boolean(i.disabled)]));

  it("opens its owner when known, then its folder, then Remove", () => {
    assert.deepEqual(ids({ owner: { kind: "ticket", id: "T-1", label: "T-1" }, running: false }), [
      [["open", "Open ticket", false]],
      [
        ["reveal", "Show in folder", false],
        ["copy", "Copy path", false],
      ],
      [["remove", "Remove", false]],
    ]);
  });

  it("has nothing to open without an owner, and holds Remove while it runs", () => {
    const sections = ids({ owner: null, running: true });
    assert.deepEqual(sections[0], []);
    assert.deepEqual(sections[2], [["remove", "Remove", true]]);
  });
});
