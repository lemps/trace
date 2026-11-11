// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextFix,
  noticeText,
  type PreflightCheck,
  parseChecks,
  problemKey,
  requiredProblems,
  shouldNotify,
  stepBy,
} from "./checks.ts";
import { alreadySetUp, DEFAULT_SETUP, parseSetup, type UsageFacts } from "./prefs.ts";

function check(id: string, ok: boolean, required = true): PreflightCheck {
  return {
    id,
    ok,
    required,
    title: `${id} title`,
    detail: "",
    fix: ok ? null : `fix ${id}`,
    action: null,
  };
}

describe("nextFix", () => {
  const fixable = (id: string, action: "install" | "signIn"): PreflightCheck => ({
    ...check(id, false),
    action,
  });

  it("installs before signing in, and skips what can't be fixed or isn't required", () => {
    const checks = [
      fixable("gh", "signIn"),
      check("git", false),
      fixable("claude", "install"),
      { ...fixable("codex", "install"), required: false },
    ];
    assert.deepEqual(nextFix(checks, new Set()), { id: "claude", action: "install" });
    assert.deepEqual(nextFix(checks, new Set(["claude:install"])), { id: "gh", action: "signIn" });
  });

  it("stops once everything fixable was tried", () => {
    const checks = [fixable("gh", "signIn"), check("git", false)];
    assert.equal(nextFix(checks, new Set(["gh:signIn"])), null);
    assert.equal(nextFix([check("git", true)], new Set()), null);
  });
});

describe("parseChecks", () => {
  it("reads the backend's list and drops what isn't a check", () => {
    const raw = [
      { id: "git", ok: true, required: true, title: "Git", detail: "/usr/bin/git", fix: null },
      {
        id: "gh",
        ok: false,
        required: true,
        title: "gh",
        detail: "x",
        fix: "gh auth login",
        action: "signIn",
      },
      { ok: true },
      "nonsense",
    ];
    const checks = parseChecks(raw);
    assert.deepEqual(
      checks.map((c) => c.id),
      ["git", "gh"]
    );
    assert.equal(checks[1].fix, "gh auth login");
    assert.equal(checks[1].action, "signIn");
    assert.equal(checks[0].action, null);
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

describe("alreadySetUp", () => {
  const none: UsageFacts = { repos: 0, sessions: 0, trackers: 0, interrupted: 0 };

  it("is false for a new user, who gets the first run", () => {
    assert.equal(alreadySetUp(none), false);
  });

  it("is true on any one sign of earlier use", () => {
    assert.equal(alreadySetUp({ ...none, repos: 1 }), true);
    assert.equal(alreadySetUp({ ...none, sessions: 3 }), true);
    assert.equal(alreadySetUp({ ...none, trackers: 1 }), true);
    assert.equal(alreadySetUp({ ...none, interrupted: 2 }), true, "never over the resume modal");
  });
});
