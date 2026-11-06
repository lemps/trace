// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { luminance, minimumContrastFor } from "./contrast.ts";

describe("terminal contrast", () => {
  it("lifts faint text on the light schemes", () => {
    assert.equal(minimumContrastFor("#ffffff"), 4.5); // Light
    assert.equal(minimumContrastFor("#fdfaf3"), 4.5); // Paper
  });

  it("leaves the dark schemes as they were", () => {
    for (const bg of ["#050505", "#080c16", "#000000"]) {
      assert.equal(minimumContrastFor(bg), 1, bg);
    }
  });

  it("falls back to off for anything it can't read", () => {
    assert.equal(minimumContrastFor(undefined), 1);
    assert.equal(minimumContrastFor("rgb(255, 255, 255)"), 1);
    assert.equal(luminance("#fff"), null);
  });

  it("measures luminance from black to white", () => {
    assert.equal(luminance("#000000"), 0);
    assert.equal(luminance("#FFFFFF"), 1);
  });
});
