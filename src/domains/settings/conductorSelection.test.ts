// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConductorPreview, ConductorWorkspace } from "../../ipc/conductorImport.ts";
import {
  hasPermissionMode,
  initialTicks,
  selectedCount,
  toggled,
  toSelection,
  withPermissionMode,
} from "./conductorSelection.ts";

const ws = (id: string, over: Partial<ConductorWorkspace>): ConductorWorkspace => ({
  id,
  repoId: "r1",
  repoName: "app",
  repoRoot: "/src/app",
  directoryName: id,
  path: `/c/${id}`,
  branch: null,
  archived: false,
  status: "resumable",
  title: null,
  claudeSessionId: null,
  cli: "claude",
  otherSessions: 0,
  ...over,
});

const preview: ConductorPreview = {
  repos: [
    {
      id: "r1",
      name: "app",
      rootPath: "/src/app",
      remoteUrl: null,
      exists: true,
      alreadyAdded: false,
      setup: { copyFiles: [], commands: ["pnpm i"] },
      notImported: [],
      notes: [],
    },
    {
      id: "r2",
      name: "gone",
      rootPath: "/gone",
      remoteUrl: null,
      exists: false,
      alreadyAdded: false,
      setup: { copyFiles: [], commands: [] },
      notImported: [],
      notes: [],
    },
  ],
  workspaces: [
    ws("lima", {}),
    ws("oslo", { status: "transcriptMissing" }),
    ws("rome", { status: "folderMissing" }),
    ws("old", { archived: true }),
  ],
  defaults: {
    model: "opus",
    permissionMode: "acceptEdits",
    editor: "intellij",
    editorUnknown: null,
  },
  prompts: [],
  savedPromptNames: [],
};

describe("initialTicks", () => {
  it("ticks what can be imported, never archived workspaces", () => {
    const t = initialTicks(preview, { model: "", hasPermissionMode: false });
    assert.deepEqual([...t.repos], ["r1"]);
    assert.deepEqual([...t.workspaces], ["lima", "oslo"]);
    assert.deepEqual([...t.defaults].sort(), ["editor", "model", "permissionMode"]);
  });
  it("leaves defaults trace already has unticked", () => {
    const t = initialTicks(preview, { model: "sonnet", hasPermissionMode: true });
    assert.deepEqual([...t.defaults], ["editor"]);
  });
});

describe("toSelection", () => {
  it("drops what can't be imported even if ticked, and carries edited setups", () => {
    const t = initialTicks(preview, { model: "", hasPermissionMode: false });
    t.repos = toggled(t.repos, "r2", true);
    t.workspaces = toggled(toggled(t.workspaces, "rome", true), "old", true);
    t.setups.r1 = { copyFiles: [".env"], commands: [] };
    const sel = toSelection(preview, t);
    assert.deepEqual(sel.repos, [{ id: "r1", setup: { copyFiles: [".env"], commands: [] } }]);
    assert.deepEqual(sel.workspaces, ["lima", "oslo", "old"]);
    assert.equal(selectedCount(preview, t), 1 + 3 + 3);
  });
});

describe("withPermissionMode", () => {
  it("adds or replaces the flag and keeps the rest", () => {
    assert.equal(withPermissionMode("", "plan"), "--permission-mode plan");
    assert.equal(
      withPermissionMode("--verbose --permission-mode default --x", "acceptEdits"),
      "--verbose --x --permission-mode acceptEdits"
    );
    assert.equal(withPermissionMode("--permission-mode=plan", "plan"), "--permission-mode plan");
  });
  it("detects an existing flag", () => {
    assert.ok(hasPermissionMode("--a --permission-mode plan"));
    assert.ok(hasPermissionMode("--permission-mode=plan"));
    assert.ok(!hasPermissionMode("--permission-modes"));
  });
});
