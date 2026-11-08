import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { messageTime, plainText } from "./messageText.ts";

describe("a message as plain text", () => {
  it("drops emphasis, code spans, headings and quotes", () => {
    assert.equal(
      plainText("## Done\n\n**Fixed** the `parse` bug, *mostly*."),
      "Done\n\nFixed the parse bug, mostly."
    );
    assert.equal(plainText("> quoted ~~old~~ text"), "quoted old text");
  });

  it("keeps a link's address unless it is its text", () => {
    assert.equal(plainText("See [the PR](https://x.dev/1)."), "See the PR (https://x.dev/1).");
    assert.equal(plainText("[https://x.dev](https://x.dev)"), "https://x.dev");
    assert.equal(plainText("![shot](a.png) and <https://y.dev>"), "shot and https://y.dev");
  });

  it("leaves code blocks as they are, minus the fences", () => {
    const md = "Run:\n\n```sh\nls **/*.ts\n```\n\nthen `go`";
    assert.equal(plainText(md), "Run:\n\nls **/*.ts\n\nthen go");
  });

  it("doesn't eat underscores and stars inside words", () => {
    assert.equal(plainText("snake_case_name and 2*3*4"), "snake_case_name and 2*3*4");
    assert.equal(plainText("- a list\n- stays"), "- a list\n- stays");
    assert.equal(plainText("an \\*escaped\\* star"), "an *escaped* star");
  });
});

describe("a message's time", () => {
  it("is the clock time today, with the day otherwise", () => {
    const at = new Date(2026, 10, 8, 14, 5).getTime();
    assert.ok(!messageTime(at, new Date(2026, 10, 8, 20, 0).getTime()).includes(","));
    assert.ok(messageTime(at, new Date(2026, 10, 9, 9, 0).getTime()).includes(","));
  });
});
