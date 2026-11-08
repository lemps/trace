// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appliesWhen,
  effortChoices,
  effortLabel,
  modeChoices,
  modeLabel,
  modelChoices,
  modelLabel,
  modelLockReason,
  shownOption,
} from "./agentOptionsFormat.ts";

const info = (extra: Record<string, string>) => ({
  agent: "claude",
  slashCommands: [],
  busy: false,
  limits: [],
  ...extra,
});

describe("agent option pickers", () => {
  it("offers Claude's aliases plus the model in use", () => {
    assert.deepEqual(modelChoices("claude", "opus"), ["fable", "opus", "sonnet", "haiku"]);
    assert.deepEqual(modelChoices("claude", "claude-opus-5-5").at(-1), "claude-opus-5-5");
    assert.deepEqual(modelChoices("codex", "gpt-5.6"), ["gpt-5.6"]);
    assert.deepEqual(modelChoices("codex", undefined), []);
  });

  it("names models, efforts and modes in plain words", () => {
    assert.equal(modelLabel("sonnet"), "Sonnet");
    assert.equal(modelLabel("claude-haiku-5-5"), "claude-haiku-5-5");
    assert.equal(modelLabel(undefined), "Default model");
    assert.equal(effortLabel("max"), "Max");
    assert.equal(effortLabel("xhigh"), "Extra high");
    assert.equal(effortLabel(undefined), "Default effort");
    assert.equal(modeLabel("default"), "Ask");
    assert.equal(modeLabel("acceptEdits"), "Accept edits");
    assert.equal(modeLabel("plan"), "Plan");
    assert.equal(modeLabel("bypassPermissions"), "Full access");
    assert.equal(modeLabel("someNewMode"), "someNewMode");
  });

  it("gives each brand only what it can take", () => {
    assert.deepEqual(effortChoices("claude"), ["low", "medium", "high", "max"]);
    assert.deepEqual(effortChoices("codex"), ["low", "medium", "high", "xhigh"]);
    assert.ok(modeChoices("claude").includes("plan"));
    assert.ok(!modeChoices("codex").includes("plan"));
  });

  it("shows what's in effect while running, and what the next start uses when stopped", () => {
    const reported = info({ model: "claude-opus-5-5", permissionMode: "bypassPermissions" });
    const saved = { model: "sonnet", permissionMode: "default" };
    assert.equal(shownOption("permissionMode", true, reported, saved), "bypassPermissions");
    assert.equal(shownOption("permissionMode", false, reported, saved), "default");
    assert.equal(shownOption("effort", true, reported, { effort: "low" }), "low");
    assert.equal(shownOption("effort", false, reported, undefined), undefined);
  });

  it("says when a pick applies", () => {
    assert.equal(appliesWhen(false, "claude"), "Applies on next start");
    assert.equal(appliesWhen(true, "claude"), null);
    assert.equal(appliesWhen(true, "codex"), "Applies from the next message");
  });

  it("locks the model when a provider pins it, or for Codex", () => {
    assert.equal(modelLockReason("claude", undefined), null);
    assert.equal(modelLockReason("claude", "anthropic"), null);
    assert.equal(modelLockReason("claude", "deepseek"), "The deepseek provider sets the model");
    assert.ok(modelLockReason("codex", undefined));
  });
});
