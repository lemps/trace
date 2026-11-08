// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addAgentBlocker, hostHint, SANDBOX_NO_AGENTS } from "./sessionHost.ts";
import type { ScratchSession } from "./types.ts";

const session = (over: Partial<ScratchSession> = {}): ScratchSession => ({
  id: "s1",
  title: "Spike",
  cli: "claude",
  createdAt: 0,
  ...over,
});
const vercel = (remote: string | null) => ({
  kind: "vercel" as const,
  sandbox: "trace-s1",
  remote,
});

describe("addAgentBlocker", () => {
  it("lets a local session under the cap add one", () => {
    assert.equal(addAgentBlocker(session(), 4), null);
    assert.equal(addAgentBlocker(session({ agents: [{ id: "a", cli: "codex" }] }), 4), null);
  });
  it("stops a local session at the cap", () => {
    const agents = [1, 2].map((n) => ({ id: `a${n}`, cli: "codex" as const }));
    assert.match(addAgentBlocker(session({ agents }), 2) ?? "", /maximum/);
  });
  it("always blocks a sandbox session, saying why", () => {
    assert.equal(addAgentBlocker(session({ host: vercel("o/n") }), 4), SANDBOX_NO_AGENTS);
  });
});

describe("hostHint", () => {
  it("names the repo the sandbox cloned", () => {
    assert.equal(
      hostHint(vercel("noble1911/trace")),
      "Runs in a Vercel Sandbox cloned from noble1911/trace, not on this computer."
    );
  });
  it("never claims the repo root without a remote", () => {
    assert.doesNotMatch(hostHint(vercel(null)), /repo root/);
  });
});
