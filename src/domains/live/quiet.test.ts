// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupQuiet, isQuiet, QUIET_AFTER_MS } from "./quiet.ts";

const now = 100 * QUIET_AFTER_MS;
const long = now - QUIET_AFTER_MS;
const recent = now - QUIET_AFTER_MS + 1;

describe("isQuiet", () => {
  it("is a working agent not heard from for the threshold", () => {
    assert.equal(isQuiet({ light: "working", heardAt: long, background: false, now }), true);
    assert.equal(isQuiet({ light: "working", heardAt: recent, background: false, now }), false);
  });

  it("never applies to other lights", () => {
    for (const light of ["attention", "ready", "stopped"] as const) {
      assert.equal(isQuiet({ light, heardAt: 0, background: false, now }), false);
    }
  });

  it("leaves an agent waiting on its own background work as Working", () => {
    assert.equal(isQuiet({ light: "working", heardAt: 0, background: true, now }), false);
  });
});

describe("groupQuiet", () => {
  it("is quiet only when every working agent is", () => {
    assert.equal(
      groupQuiet([
        { light: "working", quiet: true },
        { light: "stopped", quiet: false },
      ]),
      true
    );
    assert.equal(
      groupQuiet([
        { light: "working", quiet: true },
        { light: "working", quiet: false },
      ]),
      false
    );
  });

  it("isn't quiet when one needs you, or none is working", () => {
    assert.equal(
      groupQuiet([
        { light: "working", quiet: true },
        { light: "attention", quiet: false },
      ]),
      false
    );
    assert.equal(groupQuiet([{ light: "ready", quiet: false }]), false);
    assert.equal(groupQuiet([]), false);
  });
});
