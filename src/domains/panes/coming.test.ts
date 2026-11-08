import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { comingView } from "./coming.ts";

describe("a tab that comes and goes", () => {
  it("shows while it has content, and not without", () => {
    assert.deepEqual(comingView(true, "a", {}), { visible: true, peeking: false });
    assert.deepEqual(comingView(false, "", {}), { visible: false, peeking: false });
  });

  it("stays hidden after its × until new content changes the signature", () => {
    assert.equal(comingView(true, "2 docs", { dismissed: "2 docs" }).visible, false);
    assert.equal(comingView(true, "3 docs", { dismissed: "2 docs" }).visible, true);
  });

  it("shows when picked from the menu, empty or not", () => {
    assert.deepEqual(comingView(false, "", { revealed: true }), { visible: true, peeking: true });
    assert.deepEqual(comingView(true, "a", { revealed: true }), { visible: true, peeking: false });
  });
});
