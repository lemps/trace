// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OUTPUT_LINES, trimLines } from "./trimLines.ts";

const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

describe("trimLines", () => {
  it("leaves short output alone", () => {
    const text = numbered(OUTPUT_LINES);
    assert.deepEqual(trimLines(text), { text, total: OUTPUT_LINES, hidden: 0 });
  });

  it("doesn't count a trailing newline as a line", () => {
    const text = `${numbered(OUTPUT_LINES)}\n`;
    assert.equal(trimLines(text).hidden, 0);
    assert.equal(trimLines(text).text, text);
  });

  it("keeps the head and the tail of long output", () => {
    const t = trimLines(numbered(100));
    assert.equal(t.total, 100);
    assert.equal(t.hidden, 60);
    const lines = t.text.split("\n");
    assert.equal(lines.length, OUTPUT_LINES + 1);
    assert.equal(lines[0], "line 1");
    assert.equal(lines[19], "line 20");
    assert.equal(lines[20], "… 60 more lines …");
    assert.equal(lines[21], "line 81");
    assert.equal(lines[lines.length - 1], "line 100");
  });

  it("says one line in the singular, and takes the extra one from the head on odd caps", () => {
    const t = trimLines(numbered(6), 5);
    assert.equal(t.text, "line 1\nline 2\nline 3\n… 1 more line …\nline 5\nline 6");
  });
});
