// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanTitle, MAX_TITLE, titleFromText } from "./sessionTitle.ts";

describe("titleFromText", () => {
  it("uses a short task as its own name", () => {
    assert.equal(titleFromText("Fix the flaky auth test"), "Fix the flaky auth test");
  });

  it("takes the first line only, with its whitespace collapsed", () => {
    assert.equal(titleFromText("  Add   a  retry \n\nand then tidy up  "), "Add a retry");
  });

  it("cuts a long first line on a word boundary", () => {
    const name = titleFromText(
      "Migrate every database table over to the new connection pooling layer"
    );
    assert.equal(name, "Migrate every database table over to…");
    assert.ok(name.length <= MAX_TITLE + 1, name);
  });

  it("cuts a single very long word where it has to", () => {
    assert.equal(titleFromText(`${"x".repeat(80)} tail`), `${"x".repeat(MAX_TITLE)}…`);
  });

  it("gives an empty task no name", () => {
    assert.equal(titleFromText("   \n  "), "");
  });
});

describe("cleanTitle", () => {
  it("drops punctuation a model added anyway", () => {
    assert.equal(cleanTitle("Fix the flaky auth test."), "Fix the flaky auth test");
    assert.equal(cleanTitle("Tidy the parser ·"), "Tidy the parser");
  });

  it("reads nothing as empty, so the caller falls back", () => {
    assert.equal(cleanTitle(null), "");
    assert.equal(cleanTitle("  "), "");
  });
});
