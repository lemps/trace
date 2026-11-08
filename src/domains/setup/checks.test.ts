// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  noticeText,
  type PreflightCheck,
  parseChecks,
  problemKey,
  requiredProblems,
  shouldNotify,
  stepBy,
} from "./checks.ts";
import { DEFAULT_SETUP, parseSetup } from "./prefs.ts";

function check(id: string, ok: boolean, required = true): PreflightCheck {
  return { id, ok, required, title: `${id} title`, detail: "", fix: ok ? null : `fix ${id}` };
}

describe("parseChecks", () => {
  it("reads the backend's list and drops what isn't a check", () => {
    const raw = [
      { id: "git", ok: true, required: true, title: "Git", detail: "/usr/bin/git", fix: null },
      { id: "gh", ok: false, required: true, title: "gh", detail: "x", fix: "gh auth login" },
      { ok: true },
      "nonsense",
    ];
    const checks = parseChecks(raw);
    assert.deepEqual(
      checks.map((c) => c.id),
      ["git", "gh"]
    );
    assert.equal(checks[1].fix, "gh auth login");
  });

  it("never shows a fix on a passing check, and treats unknown as required", () => {
    const [c] = parseChecks([{ id: "git", ok: true, fix: "stray" }]);
    assert.equal(c.fix, null);
    assert.equal(c.required, true);
    assert.equal(c.title, "git");
  });

  it("throws on something that isn't a list", () => {
    assert.throws(() => parseChecks({ id: "git" }));
  });
});

describe("launch notice", () => {
  const codexMissing = [check("git", true), check("codex", false, false)];
  const ghMissing = [check("git", true), check("gh", false), check("codex", false, false)];

  it("ignores optional checks", () => {
    assert.deepEqual(requiredProblems(codexMissing), []);
    assert.equal(problemKey(codexMissing), "");
    assert.equal(shouldNotify(codexMissing, ""), false);
  });

  it("speaks up for a required problem until that problem is dismissed", () => {
    assert.equal(problemKey(ghMissing), "gh");
    assert.equal(shouldNotify(ghMissing, ""), true);
    assert.equal(shouldNotify(ghMissing, "gh"), false);
  });

  it("speaks up again when a new problem joins a dismissed one", () => {
    const both = [check("gh", false), check("claude", false)];
    assert.equal(problemKey(both), "claude,gh", "sorted, so order can't matter");
    assert.equal(shouldNotify(both, "gh"), true);
  });

  it("names a single problem and counts several", () => {
    assert.equal(noticeText(ghMissing), "Setup: gh title.");
    assert.match(noticeText([check("gh", false), check("git", false)]), /2 things/);
  });
});

describe("stepBy", () => {
  it("moves through the steps and stops at the ends", () => {
    assert.equal(stepBy("agent", 1), "theme");
    assert.equal(stepBy("theme", 1), "connect");
    assert.equal(stepBy("connect", 1), "connect");
    assert.equal(stepBy("agent", -1), "agent");
  });
});

describe("parseSetup", () => {
  it("defaults to never set up", () => {
    assert.deepEqual(parseSetup(null), DEFAULT_SETUP);
    assert.deepEqual(parseSetup("{not json"), DEFAULT_SETUP);
    assert.deepEqual(parseSetup("[]"), { done: false, dismissed: "" });
  });

  it("reads what was saved", () => {
    assert.deepEqual(parseSetup('{"done":true,"dismissed":"gh"}'), {
      done: true,
      dismissed: "gh",
    });
    assert.deepEqual(parseSetup('{"done":"yes","dismissed":3}'), DEFAULT_SETUP);
  });
});
