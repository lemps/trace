// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentLabel, agentMenuLabel } from "./providerLabel.ts";

test("agent labels are capitalised and name the model a provider runs", () => {
  assert.equal(agentLabel("claude"), "Claude");
  assert.equal(agentLabel("claude", null), "Claude");
  assert.equal(agentLabel("codex", "anthropic"), "Codex");
  assert.equal(agentLabel("claude", "wafer"), "Kimi (Wafer)");
  assert.equal(agentLabel("claude", "deepseek-pro"), "DeepSeek Pro");
});

test("menu labels add the harness for a third-party claude only", () => {
  assert.equal(agentMenuLabel("claude", "anthropic"), "Claude");
  assert.equal(agentMenuLabel("codex", "anthropic"), "Codex");
  assert.equal(agentMenuLabel("claude", "moonshot"), "Claude · Kimi (Moonshot)");
});
