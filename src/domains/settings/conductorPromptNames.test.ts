// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConductorPreview, ConductorPrompt } from "../../ipc/conductorImport.ts";
import {
  cleanPromptName,
  isLongBody,
  nameProblem,
  promptProblems,
} from "./conductorPromptNames.ts";
import { initialTicks, selectedCount, toggled, toSelection } from "./conductorSelection.ts";

const prompt = (key: string, name: string, over: Partial<ConductorPrompt> = {}) => ({
  key,
  kind: "createPr" as const,
  name,
  title: name,
  body: `${name} body`,
  repos: ["app"],
  takenName: null,
  existing: null,
  ...over,
});

const preview: ConductorPreview = {
  repos: [],
  workspaces: [],
  defaults: { model: null, permissionMode: null, editor: null, editorUnknown: null },
  prompts: [
    prompt("createPr:r1", "pr-2", { takenName: "pr" }),
    prompt("codeReview:r1", "review", { kind: "codeReview" }),
    prompt("general:r1", "app-context", { kind: "general", existing: "ctx" }),
  ],
  savedPromptNames: ["review-diff", "pr", "ctx"],
};
const none = { model: "x", hasPermissionMode: true };

describe("prompt ticks", () => {
  it("ticks every prompt trace doesn't already have", () => {
    const t = initialTicks(preview, none);
    assert.deepEqual([...t.prompts], ["createPr:r1", "codeReview:r1"]);
  });
  it("sends keys and edited names only, never an existing one", () => {
    const t = initialTicks(preview, none);
    t.prompts = toggled(t.prompts, "general:r1", true);
    t.promptNames["codeReview:r1"] = "check";
    assert.deepEqual(toSelection(preview, t).prompts, [
      { key: "createPr:r1", name: null },
      { key: "codeReview:r1", name: "check" },
    ]);
    assert.equal(selectedCount(preview, t), 2);
  });
});

describe("names", () => {
  it("cleans and checks like the backend", () => {
    assert.equal(cleanPromptName(" /Review-PR "), "review-pr");
    assert.equal(nameProblem("fix_2"), null);
    assert.ok(nameProblem(""));
    assert.ok(nameProblem("two words"));
    assert.ok(nameProblem("saved:x"));
    assert.ok(nameProblem("-dash"));
    assert.ok(nameProblem("a".repeat(41)));
  });
  it("flags taken, duplicated and invalid names among ticked prompts only", () => {
    const t = initialTicks(preview, none);
    assert.deepEqual(promptProblems(preview, t), {});
    t.promptNames["createPr:r1"] = "/PR";
    assert.match(promptProblems(preview, t)["createPr:r1"] ?? "", /already has \/pr/);
    t.promptNames["createPr:r1"] = "Review";
    const both = promptProblems(preview, t);
    assert.deepEqual(Object.keys(both).sort(), ["codeReview:r1", "createPr:r1"]);
    t.prompts = toggled(t.prompts, "codeReview:r1", false);
    assert.deepEqual(promptProblems(preview, t), {});
    t.promptNames["createPr:r1"] = "no good";
    assert.ok(promptProblems(preview, t)["createPr:r1"]);
  });
});

describe("isLongBody", () => {
  it("clamps long or many-line bodies", () => {
    assert.ok(!isLongBody("short"));
    assert.ok(isLongBody("a\nb\nc\nd"));
    assert.ok(isLongBody("x".repeat(300)));
  });
});
