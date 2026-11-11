// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anchoredScrollTop, isStacked, STACK_BELOW_PT, targetTop } from "./anchor.ts";

describe("targetTop", () => {
  it("is where it was when the zoom doesn't change", () => {
    assert.equal(targetTop(320, 100, 100), 320);
  });

  it("keeps the same point on screen across a zoom", () => {
    // 500 CSS px at 100% is 500 points; at 125% that's 400 CSS px.
    assert.equal(targetTop(500, 100, 125), 400);
    assert.equal(targetTop(400, 125, 100), 500);
  });
});

describe("anchoredScrollTop", () => {
  it("scrolls by how far the control moved", () => {
    // It slid 140px down: scroll 140px further.
    assert.equal(
      anchoredScrollTop({ scrollTop: 200, top: 640, target: 500, maxScrollTop: 2000 }),
      340
    );
    // It moved up: scroll back.
    assert.equal(
      anchoredScrollTop({ scrollTop: 200, top: 450, target: 500, maxScrollTop: 2000 }),
      150
    );
  });

  it("does nothing when it's where it was", () => {
    assert.equal(
      anchoredScrollTop({ scrollTop: 75, top: 300, target: 300, maxScrollTop: 900 }),
      75
    );
  });

  it("stays within what the container can scroll", () => {
    assert.equal(anchoredScrollTop({ scrollTop: 20, top: 100, target: 400, maxScrollTop: 900 }), 0);
    assert.equal(
      anchoredScrollTop({ scrollTop: 880, top: 600, target: 300, maxScrollTop: 900 }),
      900
    );
    assert.equal(anchoredScrollTop({ scrollTop: 0, top: 600, target: 300, maxScrollTop: -5 }), 0);
  });
});

describe("isStacked", () => {
  it("depends on the window's width in points, not on the zoom", () => {
    const points = 1100;
    for (const scale of [80, 90, 100, 110, 125, 150]) {
      assert.equal(isStacked((points * 100) / scale, scale), false, `${scale}%`);
    }
    for (const scale of [80, 100, 150]) {
      assert.equal(isStacked((1000 * 100) / scale, scale), true, `${scale}%`);
    }
  });

  it("stacks below the breakpoint", () => {
    assert.equal(isStacked(STACK_BELOW_PT - 1, 100), true);
    assert.equal(isStacked(STACK_BELOW_PT, 100), false);
  });
});
