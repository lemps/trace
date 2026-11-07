// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseButtonHints } from "./hintPrefs.ts";
import { ariaKeys, numberedHint, titleWithHint } from "./hintText.ts";
import { effectiveKeymap, shortcutDef } from "./registry.ts";
import { bindingProblem, scopesOverlap } from "./rules.ts";

const def = (id: string) => {
  const found = shortcutDef(id);
  assert.ok(found, id);
  return found;
};

describe("titleWithHint", () => {
  it("names the chord after the label", () => {
    assert.equal(titleWithHint("Back to Sessions", "Esc"), "Back to Sessions (Esc)");
    assert.equal(titleWithHint("Interrupt", "esc"), "Interrupt (esc)");
  });
  it("is just the label when nothing is bound", () => {
    assert.equal(titleWithHint("Quick Open", ""), "Quick Open");
  });
});

describe("numberedHint", () => {
  it("puts the number in a # binding", () => {
    assert.equal(numberedHint("#", 3, "windows"), "3");
    assert.equal(numberedHint("Alt+#", 2, "windows"), "Alt+2");
    assert.equal(numberedHint("Alt+#", 2, "macos"), "⌥2");
  });
  it("is empty with no binding", () => {
    assert.equal(numberedHint(undefined, 1, "windows"), "");
  });
});

describe("ariaKeys", () => {
  it("writes aria-keyshortcuts' names", () => {
    assert.equal(ariaKeys("Ctrl+Shift+k"), "Control+Shift+K");
    assert.equal(ariaKeys("Shift+Meta+t"), "Shift+Meta+T");
    assert.equal(ariaKeys("Escape"), "Escape");
  });
  it("leaves out clicks and numbered bindings", () => {
    assert.equal(ariaKeys("Ctrl+Click"), undefined);
    assert.equal(ariaKeys("Ctrl+#"), undefined);
    assert.equal(ariaKeys(undefined), undefined);
  });
});

describe("button hints pref", () => {
  it("is off unless stored exactly as true", () => {
    assert.equal(parseButtonHints(null), false);
    assert.equal(parseButtonHints("true"), true);
    assert.equal(parseButtonHints("TRUE"), false);
    assert.equal(parseButtonHints("1"), false);
  });
});

describe("cheat sheet keys", () => {
  it("leaves its Ctrl+/ to a focused terminal: the page scope isn't heard there", () => {
    assert.equal(scopesOverlap("page", "terminal"), false);
    assert.equal(scopesOverlap("page", "find"), false);
    assert.equal(scopesOverlap("page", "inbox"), true);
    assert.equal(scopesOverlap("page", "app"), true);
  });
  it("takes Ctrl+/ on every OS, and not the search's keys", () => {
    for (const os of ["macos", "windows", "linux"] as const) {
      const keymap = effectiveKeymap({}, os);
      assert.deepEqual(keymap.cheatSheet, ["Ctrl+/"]);
      assert.equal(bindingProblem(def("cheatSheet"), "Ctrl+/", keymap, os), null);
    }
    const mac = effectiveKeymap({}, "macos");
    assert.match(bindingProblem(def("cheatSheet"), "Meta+/", mac, "macos") ?? "", /Search/);
  });
  it("refuses keys that edit text or press buttons", () => {
    const keymap = effectiveKeymap({}, "windows");
    assert.ok(bindingProblem(def("cheatSheet"), "Ctrl+c", keymap, "windows"));
    assert.ok(bindingProblem(def("cheatSheet"), "Enter", keymap, "windows"));
    assert.ok(bindingProblem(def("cheatSheet"), "Ctrl+ArrowLeft", keymap, "windows"));
  });
});
