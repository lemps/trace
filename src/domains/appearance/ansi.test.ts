// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ANSI_NAMES, termColors } from "./ansi.ts";

describe("termColors", () => {
  it("fills what a scheme leaves out with xterm's defaults", () => {
    const c = termColors({ background: "#050505", foreground: "#ededed" });
    assert.equal(c.background, "#050505");
    assert.equal(c.cursor, "#ededed");
    assert.equal(c.ansi.red, "#cc0000");
    assert.equal(Object.keys(c.ansi).length, ANSI_NAMES.length);
  });

  it("keeps the scheme's own colours", () => {
    const c = termColors({ red: "#ff0000", cursor: "#00ff00" });
    assert.equal(c.ansi.red, "#ff0000");
    assert.equal(c.cursor, "#00ff00");
    assert.equal(c.background, "#000000");
  });
});
