// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TERM_LINE_HEIGHT,
  DEFAULT_TERM_SCROLLBACK,
  parseScrollback,
  parseTermLineHeight,
  parseTermSize,
  TERM_SCROLLBACKS,
} from "./terminalOptions.ts";

describe("parseScrollback", () => {
  it("defaults to 10,000 lines (xterm's own is 1,000)", () => {
    assert.equal(DEFAULT_TERM_SCROLLBACK, 10_000);
    assert.equal(parseScrollback(""), 10_000);
  });

  it("keeps a preset", () => {
    for (const n of TERM_SCROLLBACKS) assert.equal(parseScrollback(String(n)), n);
  });

  it("refuses anything else", () => {
    for (const raw of ["0", "-1", "999999999", "5000", "abc", "1e3x"]) {
      assert.equal(parseScrollback(raw), DEFAULT_TERM_SCROLLBACK, raw);
    }
  });
});

describe("parseTermLineHeight", () => {
  it("keeps a preset", () => {
    for (const h of [1, 1.1, 1.2, 1.3, 1.5]) assert.equal(parseTermLineHeight(String(h)), h);
  });

  it("maps an older free value to the nearest preset", () => {
    assert.equal(parseTermLineHeight("1.05"), 1);
    assert.equal(parseTermLineHeight("1.25"), 1.2);
    assert.equal(parseTermLineHeight("1.4"), 1.3);
    assert.equal(parseTermLineHeight("1.45"), 1.5);
    assert.equal(parseTermLineHeight("2"), 1.5);
  });

  it("defaults when blank or junk", () => {
    assert.equal(parseTermLineHeight(""), DEFAULT_TERM_LINE_HEIGHT);
    assert.equal(parseTermLineHeight("tall"), DEFAULT_TERM_LINE_HEIGHT);
  });
});

describe("parseTermSize", () => {
  it("reads blank as the default", () => {
    assert.equal(parseTermSize(""), 0);
    assert.equal(parseTermSize("  "), 0);
  });

  it("keeps a stored size in range, to the half pixel", () => {
    assert.equal(parseTermSize("16"), 16);
    assert.equal(parseTermSize("13.3"), 13.5);
    assert.equal(parseTermSize("4"), 8);
    assert.equal(parseTermSize("90"), 32);
  });
});
