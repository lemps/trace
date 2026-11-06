// Tests for the transcript view's pure parts: arranging items into blocks and
// summarising tool calls. Run: `npm run test:transcript` (Node runs the .ts
// directly with type stripping, so these import the app's own modules).

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, runSentence, toBlocks } from "../src/domains/transcript/blocks.ts";
import { relativeTo, summarize, todosOf } from "../src/domains/transcript/toolSummary.ts";
import type { TranscriptItem } from "../src/ipc/transcript.ts";

const call = (id: string, name: string, input: unknown): TranscriptItem => ({
  kind: "toolCall",
  id,
  toolUseId: `t-${id}`,
  name,
  input,
  at: null,
});
const result = (id: string, isError = false): TranscriptItem => ({
  kind: "toolResult",
  id: `r-${id}`,
  toolUseId: `t-${id}`,
  text: "ok",
  isError,
});

test("consecutive tool calls fold into one run, each paired with its result", () => {
  const items: TranscriptItem[] = [
    { kind: "prompt", id: "p", text: "go", at: null },
    call("a", "Read", { file_path: "/r/a.ts" }),
    result("a"),
    call("b", "Bash", { command: "ls" }),
    { kind: "reply", id: "x", text: "done", at: null },
    call("c", "Edit", { file_path: "/r/c.ts" }),
    result("c", true),
  ];
  const blocks = toBlocks(items);
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["prompt", "tools", "reply", "tools"]
  );
  const first = blocks[1];
  assert.ok(first.type === "tools");
  assert.equal(first.steps.length, 2);
  assert.equal(first.steps[0].result?.id, "r-a");
  assert.equal(first.steps[1].result, null);
  const last = blocks[3];
  assert.ok(last.type === "tools" && last.steps[0].result?.isError);
});

test("a run says what it did, merging alike tools", () => {
  const steps = toBlocks([
    call("1", "Read", {}),
    call("2", "Read", {}),
    call("3", "Bash", {}),
    call("4", "Edit", {}),
    call("5", "MultiEdit", {}),
    call("6", "Grep", {}),
  ]);
  const run = steps[0];
  assert.ok(run.type === "tools");
  assert.equal(runSentence(run.steps), "Read 2 files, ran a command, edited 2 files and searched");
  const one = toBlocks([call("1", "Agent", {})])[0];
  assert.ok(one.type === "tools");
  assert.equal(runSentence(one.steps), "Started an agent");
});

test("tool lines name their target", () => {
  assert.deepEqual(summarize("Bash", { command: "npm test", description: "Run tests" }), {
    label: "Bash",
    target: "Run tests",
    path: null,
    isCode: false,
  });
  assert.equal(summarize("Bash", { command: "a\nb" }).target, "a …");
  assert.equal(summarize("Edit", { file_path: "C:\\r\\x.ts" }).path, "C:\\r\\x.ts");
  assert.equal(summarize("Grep", { pattern: "foo", path: "src" }).target, "foo in src");
  assert.equal(summarize("mcp__github__create_pr", { title: "Fix" }).label, "github · create_pr");
  assert.equal(summarize("mcp__github__create_pr", { title: "Fix" }).target, "Fix");
  assert.equal(summarize("Weird", 42).target, "");
});

test("todo lists survive odd input", () => {
  const todos = todosOf({
    todos: [{ content: "a", status: "completed" }, { content: "b", status: "???" }, { nope: 1 }],
  });
  assert.deepEqual(todos, [
    { content: "a", status: "completed" },
    { content: "b", status: "pending" },
  ]);
  assert.equal(summarize("TodoWrite", { todos: [{ content: "a", status: "completed" }] }).target, "1 of 1 done");
});

test("paths inside the workspace show relative to it", () => {
  assert.equal(relativeTo("C:\\repo\\src\\a.ts", "C:/repo"), "src/a.ts");
  assert.equal(relativeTo("/repo/src/a.ts", "/repo/"), "src/a.ts");
  assert.equal(relativeTo("/other/a.ts", "/repo"), "/other/a.ts");
  assert.equal(relativeTo("/repo2/a.ts", "/repo"), "/repo2/a.ts");
});

test("durations read naturally", () => {
  assert.equal(formatDuration(4200), "4s");
  assert.equal(formatDuration(90_000), "1m 30s");
  assert.equal(formatDuration(120_000), "2m");
  assert.equal(formatDuration(3_900_000), "1h 5m");
});
