// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { commandOf, compactInput, patchFiles, planOf, summarizeTool } from "./toolSummary.ts";

const s = (name: string, input: unknown) => {
  const l = summarizeTool(name, input);
  return `${l.label} ${l.target}`.trim();
};

describe("summarizeTool", () => {
  it("reads Claude's tools", () => {
    assert.equal(s("Bash", { command: "npm test\nnpm run lint" }), "Run npm test …");
    assert.equal(s("Bash", { command: "ls", description: "List files" }), "Run List files");
    assert.equal(s("Read", { file_path: "/a/b.ts" }), "Read /a/b.ts");
    assert.equal(summarizeTool("Edit", { file_path: "/a/b.ts" }).path, "/a/b.ts");
    assert.equal(s("Write", { file_path: "/a/c.ts" }), "Write /a/c.ts");
    assert.equal(s("Grep", { pattern: "foo", path: "src" }), "Search foo in src");
    assert.equal(s("Glob", { pattern: "**/*.ts" }), "Find **/*.ts");
    assert.equal(s("WebFetch", { url: "https://x.dev" }), "Fetch https://x.dev");
    assert.equal(
      s("Task", { description: "Look", subagent_type: "Explore" }),
      "Agent Look (Explore)"
    );
    assert.equal(s("Skill", { skill: "trace-ui" }), "Skill trace-ui");
    assert.equal(s("WebSearch", { query: "tauri" }), "Web search tauri");
  });

  it("says how far a task list has got", () => {
    const todos = [
      { content: "Plan", status: "completed" },
      { content: "Build", status: "in_progress" },
      { content: "Ship", status: "pending" },
    ];
    assert.equal(s("TodoWrite", { todos }), "Tasks 1 of 3 done");
    assert.equal(s("TodoWrite", { todos: [] }), "Tasks");
    assert.equal(summarizeTool("TodoWrite", { todos }).category, "plan");
  });

  it("reads Codex's tools the same way", () => {
    assert.equal(s("shell", { command: ["bash", "-lc", "cargo test"] }), "Run cargo test");
    assert.equal(
      s("shell", { command: ["git", "commit", "-m", "a b"] }),
      'Run git commit -m "a b"'
    );
    const patch = "*** Begin Patch\n*** Update File: src/a.rs\n@@\n-x\n+y\n*** End Patch";
    assert.equal(s("apply_patch", { input: patch }), "Patch src/a.rs");
    assert.equal(summarizeTool("apply_patch", { input: patch }).category, "edit");
  });

  it("falls back to the name and input", () => {
    assert.equal(
      s("mcp__github__create_pr", { title: "Fix" }),
      'github · create_pr {"title":"Fix"}'
    );
    assert.equal(s("Mystery", { query: "where" }), "Mystery where");
    assert.equal(s("Mystery", {}), "Mystery");
    assert.equal(s("Mystery", undefined), "Mystery");
  });
});

describe("helpers", () => {
  it("unwraps shells and lists patch files", () => {
    assert.equal(commandOf({ cmd: "echo hi" }), "echo hi");
    assert.equal(commandOf({ command: ["pwsh", "-Command", "dir"] }), "dir");
    assert.deepEqual(patchFiles("*** Add File: a\n*** Delete File: b"), ["a", "b"]);
  });

  it("reads either agent's task list as a plan", () => {
    assert.deepEqual(
      planOf({ todos: [{ content: "A", status: "in_progress" }, { status: "done" }] }).items,
      [{ text: "A", status: "inProgress" }]
    );
    assert.deepEqual(planOf({ plan: [{ step: "B", status: "completed" }] }).items, [
      { text: "B", status: "done" },
    ]);
    assert.deepEqual(planOf(undefined).items, []);
  });

  it("clips long inputs", () => {
    assert.ok(compactInput({ x: "y".repeat(500) }).endsWith("…"));
  });
});
