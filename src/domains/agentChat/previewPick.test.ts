// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { previewIsMarkdown, shownPreview } from "./previewPick.ts";

const options = [
  { label: "Log at WARN", preview: "log.warn(e)" },
  { label: "Sentry filter" },
  { label: "Inbound rule", preview: "deny scanner" },
];

describe("a question's preview", () => {
  it("shows the option pointed at", () => {
    assert.deepEqual(shownPreview(options, ["Log at WARN"], 2), {
      label: "Inbound rule",
      text: "deny scanner",
    });
  });

  it("falls back to the picked option's, then the first there is", () => {
    assert.equal(shownPreview(options, ["Inbound rule"], null)?.label, "Inbound rule");
    assert.equal(shownPreview(options, [], null)?.label, "Log at WARN");
  });

  it("keeps the last one up while pointing at an option without one", () => {
    assert.equal(shownPreview(options, ["Inbound rule"], 1)?.label, "Inbound rule");
    assert.equal(shownPreview(options, [], 1)?.label, "Log at WARN");
  });

  it("shows nothing when no option has a preview", () => {
    assert.equal(shownPreview([{ label: "Yes" }, { label: "No" }], ["Yes"], 0), null);
  });

  it("draws a fenced block as Markdown and anything else as written", () => {
    assert.equal(previewIsMarkdown("```java\nlog.warn(e);\n```"), true);
    assert.equal(previewIsMarkdown("Before:\n\n~~~\nx\n~~~"), true);
    assert.equal(previewIsMarkdown("+------+\n| Save |\n+------+"), false);
    assert.equal(previewIsMarkdown("log.warn(e)"), false);
  });
});
