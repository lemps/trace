import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanDoc } from "../../ipc/plans.ts";
import {
  groupSeries,
  hasUnseen,
  newestAt,
  planTabVisible,
  previousVersion,
  versionDiff,
} from "./model.ts";

const doc = (
  id: string,
  series: string,
  version: number,
  createdAt: number,
  body = id
): PlanDoc => ({
  id,
  series,
  title: id,
  source: "planMode",
  format: "markdown",
  body,
  createdAt,
  version,
});

describe("plan documents", () => {
  it("group into series, newest updated first, versions in order", () => {
    const list = groupSeries([doc("a2", "a", 2, 30), doc("b1", "b", 1, 20), doc("a1", "a", 1, 10)]);
    assert.deepEqual(
      list.map((s) => s.series),
      ["a", "b"]
    );
    assert.deepEqual(
      list[0].versions.map((v) => v.id),
      ["a1", "a2"]
    );
    assert.equal(list[0].latest.id, "a2");
    assert.equal(previousVersion(list[0], list[0].latest)?.id, "a1");
    assert.equal(previousVersion(list[0], list[0].versions[0]), null);
  });

  it("diff two versions line by line", () => {
    const lines = versionDiff(
      doc("1", "a", 1, 1, "# P\nstep one\n"),
      doc("2", "a", 2, 2, "# P\nstep two\n")
    );
    assert.deepEqual(
      lines.map((l) => l.kind),
      ["ctx", "del", "add"]
    );
  });

  it("are unseen until the newest has been looked at", () => {
    const docs = [doc("a", "a", 1, 10), doc("b", "b", 1, 20)];
    assert.equal(hasUnseen(docs, null), true);
    assert.equal(hasUnseen(docs, 10), true);
    assert.equal(hasUnseen(docs, newestAt(docs)), false);
    assert.equal(hasUnseen([], null), false);
  });
});

describe("the Plan tab's visibility", () => {
  const tasks = (n: number) => ({
    items: Array.from({ length: n }, () => ({ text: "t", status: "pending" as const })),
    updatedAt: 1,
  });

  it("shows only with a document or a task list", () => {
    assert.equal(planTabVisible({ docs: 0, tasks: null }, false), false);
    assert.equal(planTabVisible({ docs: 0, tasks: tasks(0) }, false), false);
    assert.equal(planTabVisible({ docs: 1, tasks: null }, false), true);
    assert.equal(planTabVisible({ docs: 0, tasks: tasks(2) }, false), true);
  });

  it("shows empty while opened from the menu, and hides again once closed", () => {
    assert.equal(planTabVisible({ docs: 0, tasks: null }, true), true);
    assert.equal(planTabVisible({ docs: 0, tasks: null }, false), false);
  });
});
