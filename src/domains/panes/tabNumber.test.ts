import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tabNumbers } from "./tabNumber.ts";

describe("a tab's number", () => {
  it("counts the detail's own showing tabs, in order", () => {
    const numbers = tabNumbers([
      { id: "chat" },
      { id: "plan", hidden: true },
      { id: "files" },
      { id: "sub:a:1", optional: true },
      { id: "terminal" },
    ]);
    assert.deepEqual(
      [...numbers],
      [
        ["chat", 1],
        ["files", 2],
        ["terminal", 3],
      ]
    );
  });

  it("stops at nine", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}` }));
    const numbers = tabNumbers(many);
    assert.equal(numbers.size, 9);
    assert.equal(numbers.get("t8"), 9);
    assert.equal(numbers.get("t9"), undefined);
  });
});
