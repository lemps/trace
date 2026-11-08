// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { VercelStatus } from "../../ipc/vercel.ts";
import type { GitHubStatus } from "../github/types.ts";
import { readiness } from "./readiness.ts";

const vercel = (claude: VercelStatus["claude"]): VercelStatus => ({
  user: "ron",
  team: "ron-team",
  project: "trace-sessions",
  claude,
});
const github = (over: Partial<GitHubStatus> = {}): GitHubStatus => ({
  login: "ron",
  source: "device",
  scopes: ["repo", "read:org"],
  expiresAt: null,
  ghAvailable: true,
  deviceFlow: true,
  problem: null,
  accounts: [{ login: "ron", source: "device", primary: true, problem: null }],
  ...over,
});
const row = (rows: ReturnType<typeof readiness>, id: string) => rows.find((r) => r.id === id);

describe("readiness", () => {
  it("is all ticks when everything is set up", () => {
    const rows = readiness(vercel("oauthToken"), github());
    assert.deepEqual(
      rows.map((r) => r.ok),
      [true, true, true]
    );
    assert.ok(rows.every((r) => r.fix === null));
  });

  it("says how to fix each missing piece", () => {
    const rows = readiness(null, github({ login: null, accounts: [] }));
    assert.equal(row(rows, "vercel")?.ok, false);
    assert.match(row(rows, "vercel")?.fix ?? "", /Tokens/);
    assert.match(row(rows, "claude")?.fix ?? "", /Connect Vercel first/);
    assert.match(row(rows, "github")?.fix ?? "", /Integrations → GitHub/);
  });

  it("flags no Claude login, since chat then can't log in", () => {
    const claude = row(readiness(vercel(null), github()), "claude");
    assert.equal(claude?.ok, false);
    assert.match(claude?.fix ?? "", /\/login/);
  });

  it("flags a token that can't push, or none that works", () => {
    const readOnly = row(readiness(vercel("apiKey"), github({ scopes: ["read:org"] })), "github");
    assert.equal(readOnly?.ok, false);
    assert.match(readOnly?.fix ?? "", /repo scope/);
    const broken = github({
      problem: "Bad credentials",
      accounts: [{ login: "ron", source: "pasted", primary: true, problem: "Bad credentials" }],
    });
    assert.match(row(readiness(vercel("apiKey"), broken), "github")?.fix ?? "", /Bad credentials/);
  });

  it("trusts a fine-grained token, which lists no scopes", () => {
    assert.equal(row(readiness(vercel("apiKey"), github({ scopes: null })), "github")?.ok, true);
  });

  it("is still checking GitHub before its status is in", () => {
    assert.equal(row(readiness(vercel("apiKey"), null), "github")?.ok, null);
  });
});
