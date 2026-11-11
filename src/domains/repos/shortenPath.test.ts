// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shortenPath } from "./shortenPath.ts";

const LONG = "/Users/ron/IdeaProjects/obsidian/clients/obsidian-delivery-skills";

describe("shortenPath", () => {
  it("leaves a path that fits alone", () => {
    assert.equal(shortenPath("/Users/ron/trace", 40), "/Users/ron/trace");
  });

  it("keeps the start and the last folder, cutting the start back to a whole folder", () => {
    assert.equal(shortenPath(LONG, 52), "/Users/ron/IdeaProjects/…/obsidian-delivery-skills");
    assert.equal(shortenPath(LONG, 48), "/Users/ron/…/obsidian-delivery-skills");
  });

  it("never goes over the limit", () => {
    for (let max = 2; max <= LONG.length; max++) {
      assert.ok(shortenPath(LONG, max).length <= max, `max ${max}`);
    }
  });

  it("keeps the last folder whole while it fits", () => {
    assert.ok(shortenPath(LONG, 30).endsWith("/obsidian-delivery-skills"));
    assert.ok(shortenPath(LONG, 30).startsWith("/"));
  });

  it("cuts a last folder too long to keep from its start", () => {
    assert.equal(shortenPath(LONG, 10), "…ry-skills");
  });

  it("handles Windows separators", () => {
    const short = shortenPath("C:\\Users\\ron\\IdeaProjects\\clients\\trace-app", 28);
    assert.equal(short, "C:\\Users\\ron\\…\\trace-app");
  });

  it("ignores a trailing separator", () => {
    assert.equal(shortenPath("/a/b/", 4), "/a/b");
  });
});
