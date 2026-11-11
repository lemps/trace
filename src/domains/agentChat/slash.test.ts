// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandSaved, type SlashPrompt, slashEntries, slashMatches } from "./slash.ts";

const prompt = (name: string, body = `${name} body`): SlashPrompt => ({
  name,
  title: `${name} title`,
  body,
});

const labels = (text: string, commands: string[], prompts: SlashPrompt[]) =>
  slashMatches(text, slashEntries(commands, prompts))?.map((e) => e.label) ?? null;

describe("slashEntries", () => {
  it("lists saved prompts first, then the agent's commands without their slash", () => {
    const entries = slashEntries(["/compact", "clear"], [prompt("pr")]);
    assert.deepEqual(
      entries.map((e) => e.label),
      ["pr", "compact", "clear"]
    );
    assert.equal(entries[0].saved?.body, "pr body");
    assert.equal(entries[1].saved, undefined);
  });

  it("gives way to an agent command of the same name", () => {
    const entries = slashEntries(["review"], [prompt("Review"), prompt("pr")]);
    assert.deepEqual(
      entries.map((e) => e.label),
      ["saved:Review", "pr", "review"]
    );
  });
});

describe("slashMatches", () => {
  it("shows nothing without a lone /word or with nothing to offer", () => {
    assert.equal(labels("hello", ["compact"], []), null);
    assert.equal(labels("/compact now", ["compact"], []), null);
    assert.equal(labels("/", [], []), null);
    assert.equal(labels("/zzz", ["compact"], [prompt("pr")]), null);
  });

  it("matches by prefix, case-insensitively", () => {
    assert.deepEqual(labels("/C", ["compact", "clear", "pr-comments"], []), ["compact", "clear"]);
  });

  it("matches a renamed saved prompt by its bare name or its label", () => {
    assert.deepEqual(labels("/rev", ["review"], [prompt("review")]), ["saved:review", "review"]);
    assert.deepEqual(labels("/saved:", ["review"], [prompt("review")]), ["saved:review"]);
  });

  it("puts an exact match first", () => {
    assert.deepEqual(labels("/pr", ["pr-comments"], [prompt("pr")]), ["pr", "pr-comments"]);
    assert.deepEqual(labels("/review", ["review", "review-all"], [prompt("review")]), [
      "review",
      "saved:review",
      "review-all",
    ]);
  });

  it("closes on a command typed in full, but keeps a saved prompt's row", () => {
    assert.equal(labels("/compact", ["compact"], []), null);
    assert.deepEqual(labels("/pr", [], [prompt("pr")]), ["pr"]);
  });

  it("lists every match, so `/` alone shows them all", () => {
    const many = Array.from({ length: 40 }, (_, i) => `cmd${i}`);
    assert.equal(labels("/", many, [])?.length, 40);
  });

  it("describes the commands Claude Code describes", () => {
    const details = [{ name: "compact", description: "Keep a summary", argumentHint: "[how]" }];
    const entries = slashEntries(["compact", "mine"], [], details);
    assert.equal(entries[0].detail?.description, "Keep a summary");
    assert.equal(entries[1].detail, undefined);
  });

  it("offers Claude Code's commands until the agent lists its own", () => {
    const details = [{ name: "mcp", description: "Manage MCP servers", argumentHint: "" }];
    assert.deepEqual(
      slashEntries([], [], details).map((e) => e.label),
      ["mcp"]
    );
    assert.deepEqual(
      slashEntries(["own"], [], details).map((e) => e.label),
      ["own"]
    );
  });
});

describe("expandSaved", () => {
  const entries = slashEntries(["review"], [prompt("review", "Look hard."), prompt("pr", "Ship")]);

  it("expands a saved prompt's exact label, trimmed and any case", () => {
    assert.equal(expandSaved("/pr", entries), "Ship");
    assert.equal(expandSaved("  /PR \n", entries), "Ship");
    assert.equal(expandSaved("/saved:review", entries), "Look hard.");
  });

  it("leaves the agent's commands, prefixes and other text alone", () => {
    assert.equal(expandSaved("/review", entries), null);
    assert.equal(expandSaved("/p", entries), null);
    assert.equal(expandSaved("/pr now", entries), null);
    assert.equal(expandSaved("pr", entries), null);
  });
});
