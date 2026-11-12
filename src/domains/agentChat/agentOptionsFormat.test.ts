// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appliesWhen,
  effortChoices,
  effortLabel,
  effortSuffix,
  isModel,
  modeChoices,
  modeDetail,
  modeGlyph,
  modeLabel,
  modelChoices,
  modelEffortName,
  modelEffortText,
  modelLabel,
  modelLockReason,
  modelName,
  pickerTitle,
  shownOption,
  TRACE_MODE,
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

  it("offers what the CLI lists once it's known, named its way", () => {
    const catalog = [
      { value: "opus", displayName: "Opus 5.5" },
      { value: "claude-fable-5-2", displayName: "Fable 5.2" },
    ];
    assert.deepEqual(modelChoices("claude", undefined, catalog), ["opus", "claude-fable-5-2"]);
    assert.deepEqual(modelChoices("claude", "haiku", catalog).at(-1), "haiku");
    assert.deepEqual(modelChoices("codex", undefined, catalog), []);
    assert.equal(modelName("opus", catalog), "Opus 5.5");
    assert.equal(modelName("sonnet", catalog), "Sonnet");
    assert.equal(modelName(undefined, catalog), "Default model");
  });

  it("knows a running agent's id is the alias it was picked as", () => {
    const catalog = [
      { value: "opus", displayName: "Opus 5.5", resolvedModel: "claude-opus-5-5" },
      { value: "fable", displayName: "Fable 5.1", resolvedModel: "claude-fable-5-1" },
      { value: "claude-opus-5", displayName: "Opus 5", resolvedModel: "claude-opus-5" },
    ];
    assert.deepEqual(modelChoices("claude", "claude-opus-5-5", catalog), [
      "opus",
      "fable",
      "claude-opus-5",
    ]);
    assert.equal(isModel("opus", "claude-opus-5-5", catalog), true);
    assert.equal(isModel("fable", "claude-opus-5-5", catalog), false);
    // Listed under its own id: that row, not an alias, is the one in use.
    assert.equal(isModel("claude-opus-5", "claude-opus-5", catalog), true);
    assert.equal(modelName("claude-fable-5-1", catalog), "Fable 5.1");
  });

  it("names Claude's models, from aliases and ids", () => {
    assert.equal(modelLabel("sonnet"), "Sonnet");
    assert.equal(modelLabel("opus"), "Opus");
    assert.equal(modelLabel("opus[1m]"), "Opus 1M");
    assert.equal(modelLabel("claude-opus-5-5"), "Opus 5.5");
    assert.equal(modelLabel("claude-sonnet-5-5"), "Sonnet 5.5");
    assert.equal(modelLabel("claude-haiku-5-5"), "Haiku 5.5");
    assert.equal(modelLabel("claude-fable-5-2"), "Fable 5.2");
    assert.equal(modelLabel("claude-opus-5-5-20261001"), "Opus 5.5");
    assert.equal(modelLabel("claude-opus-5"), "Opus 5");
    assert.equal(modelLabel("claude-sonnet-4-20250514"), "Sonnet 4");
    assert.equal(modelLabel("claude-opus-5-5[1m]"), "Opus 5.5 1M");
    assert.equal(modelLabel("claude-sonnet-5-5-20261001[1m]"), "Sonnet 5.5 1M");
    assert.equal(modelLabel("claude-opus-4-5@20251101"), "Opus 4.5");
    assert.equal(modelLabel("claude-3-5-sonnet-20241022"), "Sonnet 3.5");
    assert.equal(modelLabel("claude-3-opus-20240229"), "Opus 3");
    assert.equal(modelLabel(undefined), "Default model");
    assert.equal(modelLabel(""), "Default model");
  });

  it("shows any other model exactly as it is", () => {
    for (const id of [
      "kimi-k3-fast",
      "Kimi-K3",
      "deepseek-v4-pro[1m]",
      "deepseek-v4-flash",
      "gpt-5.6",
      "gpt-5.6-codex",
      "claude-opus",
      "claude-opus-latest",
      "claude-opus-5-5-preview",
      "claude-poem-5-5",
      "Claude-Opus-5-5",
      "anthropic.claude-3-5-sonnet-20241022-v2:0",
      "something-new",
    ]) {
      assert.equal(modelLabel(id), id);
    }
  });

  it("reads model and effort as one pill", () => {
    const line = (m?: string, e?: string) => {
      const text = modelEffortText(m, e);
      return text.model + effortSuffix(text);
    };
    assert.equal(line("claude-opus-5-5", "high"), "Opus 5.5 · High");
    assert.equal(line("claude-opus-5-5", undefined), "Opus 5.5");
    assert.equal(line(undefined, "high"), "Default model · High");
    assert.equal(line(undefined, undefined), "Default model");
    assert.equal(line("gpt-5.6-codex", "xhigh"), "gpt-5.6-codex · Extra high");
    assert.deepEqual(modelEffortText("opus", undefined), { model: "Opus", effort: null });
    assert.equal(
      modelEffortName(modelEffortText("claude-opus-5-5", "high")),
      "Model and effort: Opus 5.5, High"
    );
    assert.equal(
      modelEffortName(modelEffortText(undefined, undefined)),
      "Model and effort: Default model, Default effort"
    );
  });

  it("titles a picker with its value, then when it applies or why it can't change", () => {
    assert.equal(pickerTitle("Permission mode: Ask", [null]), "Permission mode: Ask");
    assert.equal(
      pickerTitle("Model and effort: Opus 5.5, High", [null, "Applies on next start"]),
      "Model and effort: Opus 5.5, High. Applies on next start"
    );
  });

  it("puts a glyph in front of each mode", () => {
    assert.equal(modeGlyph("default"), "Hand");
    assert.equal(modeGlyph("acceptEdits"), "Pencil");
    assert.equal(modeGlyph("plan"), "Plan");
    assert.equal(modeGlyph("bypassPermissions"), "ShieldAlert");
    assert.equal(modeGlyph(TRACE_MODE), "ShieldCheck");
    assert.equal(modeGlyph("dontAsk"), "Ban");
    assert.equal(modeGlyph("auto"), "ShieldCheck");
    assert.equal(modeGlyph("someNewMode"), "Shield");
    assert.equal(modeGlyph("constructor"), "Shield");
    assert.equal(modeGlyph(undefined), "Shield");
  });

  it("names efforts and modes in plain words", () => {
    assert.equal(effortLabel("max"), "Max");
    assert.equal(effortLabel("xhigh"), "Extra high");
    assert.equal(effortLabel(undefined), "Default effort");
    assert.equal(modeLabel("default"), "Ask");
    assert.equal(modeLabel("acceptEdits"), "Accept edits");
    assert.equal(modeLabel("plan"), "Plan");
    assert.equal(modeLabel("bypassPermissions"), "Full access");
    assert.equal(modeLabel(TRACE_MODE), "Reviewed by trace");
    assert.equal(modeLabel("someNewMode"), "someNewMode");
  });

  it("gives each brand only what it can take", () => {
    assert.deepEqual(effortChoices("claude"), ["low", "medium", "high", "max"]);
    assert.deepEqual(effortChoices("codex"), ["low", "medium", "high", "xhigh"]);
    assert.ok(modeChoices("claude").includes("plan"));
    assert.ok(!modeChoices("codex").includes("plan"));
    // Codex doesn't route its approvals through trace's rules yet.
    assert.ok(modeChoices("claude").includes(TRACE_MODE));
    assert.ok(!modeChoices("codex").includes(TRACE_MODE));
    // Picking it needs a restart, and the menu says so.
    assert.match(modeDetail(TRACE_MODE) ?? "", /next start/);
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
