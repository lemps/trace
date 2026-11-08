import assert from "node:assert/strict";
import { test } from "node:test";
import { isImagePath, previewErrorKind, shownName } from "./attachmentFiles.ts";

test("pictures are the formats agents take inline", () => {
  assert.ok(isImagePath("/a/b.PNG"));
  assert.ok(isImagePath("/a/b.jpeg"));
  assert.ok(isImagePath("C:\\x\\y.webp"));
  assert.ok(!isImagePath("/a/b.svg"));
  assert.ok(!isImagePath("/a/png"));
});

test("a saved paste shows without its unique prefix", () => {
  assert.equal(shownName("/x/attachments/0a1b2c3d-image.png"), "image.png");
  assert.equal(shownName("/repo/notes-v2.txt"), "notes-v2.txt");
  assert.equal(shownName("C:\\x\\deadbeef-a.md"), "a.md");
  assert.equal(shownName("/x/0a1b2c3d-"), "0a1b2c3d-");
});

test("a preview error reads by its kind, anything else as missing", () => {
  assert.equal(previewErrorKind({ kind: "tooBig" }), "tooBig");
  assert.equal(previewErrorKind({ kind: "notImage" }), "notImage");
  assert.equal(previewErrorKind({ kind: "missing" }), "missing");
  assert.equal(previewErrorKind("boom"), "missing");
  assert.equal(previewErrorKind(null), "missing");
});
