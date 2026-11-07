// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countChanges, type DiffLine, diffLines, linesOf, parsePatch } from "./lineDiff.ts";

const MARK: Record<DiffLine["kind"], string> = { add: "+", del: "-", gap: "~", ctx: " " };
const shape = (lines: DiffLine[]) => lines.map((l) => `${MARK[l.kind]}${l.text}`);

describe("diffLines", () => {
  it("diffs changed lines and keeps context", () => {
    assert.deepEqual(shape(diffLines("a\nb\nc", "a\nB\nc")), [" a", "-b", "+B", " c"]);
  });

  it("folds far context into a gap", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "L10");
    const out = shape(diffLines(before, after));
    assert.equal(out[0], "~7 unchanged lines");
    assert.ok(out.includes("-l10") && out.includes("+L10"));
    assert.equal(out[out.length - 1], "~6 unchanged lines");
  });

  it("handles adds and deletes of whole files", () => {
    assert.deepEqual(countChanges(diffLines("", "x\ny\n")), { added: 2, removed: 0 });
    assert.deepEqual(countChanges(diffLines("x\ny", "")), { added: 0, removed: 2 });
  });

  it("numbers lines on both sides", () => {
    const added = diffLines("a\nb", "a\nx\nb").find((l) => l.kind === "add");
    assert.ok(added && added.kind === "add" && added.newNo === 2);
  });
});

describe("parsePatch", () => {
  it("parses a unified diff with line numbers", () => {
    const out = parsePatch("--- a/x\n+++ b/x\n@@ -3,2 +3,2 @@ fn\n keep\n-old\n+new");
    assert.deepEqual(shape(out), ["~fn", " keep", "-old", "+new"]);
    const del = out.find((l) => l.kind === "del");
    assert.ok(del && del.kind === "del" && del.oldNo === 4);
  });

  it("keeps removed lines that start with -- inside a hunk", () => {
    const patch = [
      "--- a/q.sql",
      "+++ b/q.sql",
      "@@ -1,2 +1,2 @@",
      "--- old note",
      "+++ new note",
      " select 1;",
    ].join("\n");
    assert.deepEqual(shape(parsePatch(patch)), [
      "~@@ -1,2 +1,2 @@",
      "--- old note",
      "+++ new note",
      " select 1;",
    ]);
  });

  it("parses Codex patches", () => {
    const out = parsePatch("*** Begin Patch\n*** Update File: a\n@@\n-x\n+y\n*** End Patch");
    assert.deepEqual(countChanges(out), { added: 1, removed: 1 });
  });

  it("prefers the patch when a row has one", () => {
    const lines = linesOf({
      path: "a",
      change: "edit",
      before: "q",
      after: "r",
      patch: "@@\n-x\n+y",
    });
    assert.equal(lines.find((l) => l.kind === "del")?.text, "x");
  });
});
