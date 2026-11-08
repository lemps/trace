// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ICON_LINE_PX, ICON_SIZE, strokeFor } from "./iconScale.ts";

describe("strokeFor", () => {
  it("renders about 1.1px at every size on the scale", () => {
    for (const size of Object.values(ICON_SIZE)) {
      const px = (strokeFor(size) * size) / 24;
      assert.ok(Math.abs(px - ICON_LINE_PX) < 0.01, `size ${size} draws ${px}px`);
    }
  });

  it("gives smaller icons a heavier frame stroke", () => {
    assert.ok(strokeFor(12) > strokeFor(14));
    assert.ok(strokeFor(14) > strokeFor(16));
    assert.equal(strokeFor(12), 2.2);
  });

  it("falls back to the default size's stroke for a nonsense size", () => {
    assert.equal(strokeFor(0), strokeFor(16));
    assert.equal(strokeFor(Number.NaN), strokeFor(16));
  });
});
