// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitRecommended } from "./recommended.ts";

describe("splitRecommended", () => {
  it("takes a trailing (Recommended) off the label", () => {
    assert.deepEqual(splitRecommended("Use Postgres (Recommended)"), {
      label: "Use Postgres",
      recommended: true,
    });
  });

  it("ignores case and whitespace around and inside the mark", () => {
    assert.deepEqual(splitRecommended("Keep it  ( recommended )  "), {
      label: "Keep it",
      recommended: true,
    });
    assert.deepEqual(splitRecommended("Ship it(RECOMMENDED)"), {
      label: "Ship it",
      recommended: true,
    });
  });

  it("leaves a label that only mentions the word elsewhere", () => {
    for (const label of [
      "Recommended settings",
      "Use the (recommended) defaults",
      "(Recommended) first option",
      "Follow the recommended path",
      "Recommended",
    ]) {
      assert.deepEqual(splitRecommended(label), { label, recommended: false });
    }
  });

  it("keeps a label that is nothing but the mark", () => {
    assert.deepEqual(splitRecommended("(Recommended)"), {
      label: "(Recommended)",
      recommended: false,
    });
  });

  it("never changes a label without the mark", () => {
    assert.deepEqual(splitRecommended("Option A"), { label: "Option A", recommended: false });
    assert.deepEqual(splitRecommended(""), { label: "", recommended: false });
  });
});
