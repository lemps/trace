// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitInsights } from "./insight.ts";

const OPEN = "`★ Insight ─────────────────────────────────────`";
const CLOSE = "`─────────────────────────────────────────────────`";

describe("splitInsights", () => {
  it("leaves text without an insight whole", () => {
    const text = "Just a reply.\n\n- with a list";
    assert.deepEqual(splitInsights(text), [{ kind: "text", text }]);
  });

  it("cuts an insight out of the text around it", () => {
    const text = ["Before.", "", OPEN, "- one point", "- another", CLOSE, "", "After."].join("\n");
    assert.deepEqual(splitInsights(text), [
      { kind: "text", text: "Before.\n" },
      { kind: "insight", text: "- one point\n- another" },
      { kind: "text", text: "\nAfter." },
    ]);
  });

  it("finds several, and one at the very start", () => {
    const text = [OPEN, "first", CLOSE, "middle", OPEN, "second", CLOSE].join("\n");
    assert.deepEqual(
      splitInsights(text).map((s) => `${s.kind}:${s.text}`),
      ["insight:first", "text:middle", "insight:second"]
    );
  });

  it("takes the markers without backticks or with spaces around them", () => {
    const text = ["  ★ Insight ─────", "point", "  `─────`  "].join("\n");
    assert.deepEqual(splitInsights(text), [{ kind: "insight", text: "point" }]);
  });

  it("runs an insight still being written to the end of the text", () => {
    const text = ["Intro", OPEN, "- half a"].join("\n");
    assert.deepEqual(splitInsights(text), [
      { kind: "text", text: "Intro" },
      { kind: "insight", text: "- half a" },
    ]);
  });

  it("keeps code blocks inside an insight whole", () => {
    const text = [OPEN, "```ts", CLOSE, "```", "done", CLOSE].join("\n");
    assert.deepEqual(splitInsights(text), [
      { kind: "insight", text: ["```ts", CLOSE, "```", "done"].join("\n") },
    ]);
  });

  it("leaves markers inside a fenced code block alone", () => {
    const text = ["```", OPEN, "not an aside", CLOSE, "```", "after"].join("\n");
    assert.deepEqual(splitInsights(text), [{ kind: "text", text }]);
  });

  it("only closes a fence on the same marker, at least as long", () => {
    const text = ["~~~~", "```", OPEN, "~~~", "~~~~", OPEN, "x", CLOSE].join("\n");
    assert.deepEqual(
      splitInsights(text).map((s) => s.kind),
      ["text", "insight"]
    );
  });

  it("needs the label: a bare rule or a star elsewhere is just text", () => {
    const text = ["★ starred", CLOSE, "`★ Insights are fun` he said"].join("\n");
    assert.deepEqual(splitInsights(text), [{ kind: "text", text }]);
  });
});
