// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chordFromEvent, chordsCollide, formatChord, matchIndex } from "./chord.ts";
import { cleanOverrides, effectiveKeymap, SHORTCUTS, shortcutDef } from "./registry.ts";
import { asBinding, bindingProblem, findConflicts, terminalNeeds } from "./rules.ts";

const key = (k: string, code: string, mods: Partial<Record<string, boolean>> = {}) => ({
  key: k,
  code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

const def = (id: string) => {
  const found = shortcutDef(id);
  assert.ok(found, id);
  return found;
};

describe("chordFromEvent", () => {
  it("lowercases letters, whatever Shift did", () => {
    assert.equal(
      chordFromEvent(key("K", "KeyK", { ctrlKey: true, shiftKey: true })),
      "Ctrl+Shift+k"
    );
  });
  it("reads ⌥ chords by physical key (⌥J types ∆ on macOS)", () => {
    assert.equal(chordFromEvent(key("∆", "KeyJ", { altKey: true })), "Alt+j");
  });
  it("reads shifted symbols and digits as their base key", () => {
    assert.equal(
      chordFromEvent(key("?", "Slash", { ctrlKey: true, shiftKey: true })),
      "Ctrl+Shift+/"
    );
    assert.equal(
      chordFromEvent(key("!", "Digit1", { ctrlKey: true, shiftKey: true })),
      "Ctrl+Shift+1"
    );
  });
  it("keeps the layout's letter over the physical key", () => {
    assert.equal(chordFromEvent(key("a", "KeyQ")), "a");
  });
  it("ignores a bare modifier", () => {
    assert.equal(chordFromEvent(key("Shift", "ShiftLeft", { shiftKey: true })), null);
  });
  it("names named keys", () => {
    assert.equal(chordFromEvent(key("ArrowUp", "ArrowUp", { altKey: true })), "Alt+ArrowUp");
    assert.equal(chordFromEvent(key(" ", "Space")), "Space");
  });
});

describe("matching", () => {
  it("matches exactly", () => {
    assert.equal(matchIndex("Ctrl+Shift+j", "Ctrl+Shift+j"), 0);
    assert.equal(matchIndex("Ctrl+Shift+j", "Ctrl+j"), null);
    assert.equal(matchIndex("j", "Alt+j"), null);
  });
  it("gives a # binding the number pressed", () => {
    assert.equal(matchIndex("Meta+#", "Meta+3"), 2);
    assert.equal(matchIndex("Meta+#", "Shift+Meta+3"), null);
    assert.equal(matchIndex("Ctrl+#", "Ctrl+0"), null);
    assert.equal(matchIndex("#", "9"), 8);
  });
  it("collides # with any digit under the same modifiers", () => {
    assert.ok(chordsCollide("Ctrl+#", "Ctrl+4"));
    assert.ok(!chordsCollide("Ctrl+#", "Ctrl+Shift+4"));
  });
});

describe("formatChord", () => {
  it("writes each OS's way", () => {
    assert.equal(formatChord("Shift+Meta+n", "macos"), "⇧⌘N");
    assert.equal(formatChord("Ctrl+Shift+n", "windows"), "Ctrl+Shift+N");
    assert.equal(formatChord("Meta+#", "macos"), "⌘1–9");
    assert.equal(formatChord("Ctrl+Enter", "linux"), "Ctrl+⏎");
    assert.equal(formatChord("Alt+ArrowUp", "macos"), "⌥↑");
    assert.equal(formatChord("Alt+Click", "windows"), "Alt-click");
    assert.equal(formatChord("Escape", "macos"), "esc");
  });
});

describe("registry", () => {
  it("has unique ids", () => {
    assert.equal(new Set(SHORTCUTS.map((s) => s.id)).size, SHORTCUTS.length);
  });
  for (const os of ["macos", "windows", "linux"] as const) {
    it(`has no conflicting defaults on ${os}`, () => {
      assert.deepEqual([...findConflicts(effectiveKeymap({}, os)).keys()], []);
    });
    it(`accepts every rebindable default on ${os}`, () => {
      const keymap = effectiveKeymap({}, os);
      for (const s of SHORTCUTS.filter((s) => !s.isFixed)) {
        for (const chord of keymap[s.id]) {
          assert.equal(bindingProblem(s, chord, keymap, os), null, `${s.id} ${chord}`);
        }
      }
    });
  }
  it("applies rebindings, never to fixed shortcuts", () => {
    const keymap = effectiveKeymap({ orchestrator: ["Ctrl+Shift+o"], termCopy: ["x"] }, "windows");
    assert.deepEqual(keymap.orchestrator, ["Ctrl+Shift+o"]);
    assert.deepEqual(keymap.termCopy, ["Ctrl+Shift+c"]);
  });
  it("cleans stored rebindings", () => {
    assert.deepEqual(
      cleanOverrides({ search: ["Ctrl+Shift+f", 3], nope: ["a"], termPaste: ["b"] }),
      {
        search: ["Ctrl+Shift+f"],
      }
    );
    assert.deepEqual(cleanOverrides("junk"), {});
  });
});

describe("binding rules", () => {
  const win = effectiveKeymap({}, "windows");
  const mac = effectiveKeymap({}, "macos");
  it("keeps terminal keys from app shortcuts off macOS", () => {
    for (const chord of [
      "Ctrl+c",
      "Ctrl+d",
      "ArrowUp",
      "Ctrl+ArrowLeft",
      "Alt+b",
      "Shift+x",
      "j",
    ]) {
      assert.ok(terminalNeeds(chord, "windows"), chord);
      assert.match(bindingProblem(def("orchestrator"), chord, win, "windows") ?? "", /terminal/);
    }
    assert.ok(!terminalNeeds("Ctrl+Shift+o", "windows"));
    assert.ok(!terminalNeeds("Ctrl+#", "windows"));
  });
  it("keeps ⌃ and ⌥ chords for the terminal on macOS", () => {
    assert.ok(terminalNeeds("Ctrl+c", "macos"));
    assert.ok(terminalNeeds("Alt+f", "macos"));
    assert.ok(!terminalNeeds("Meta+o", "macos"));
  });
  it("refuses what the system or webview keeps", () => {
    for (const chord of ["Ctrl+r", "Ctrl+f", "F5", "Ctrl+Shift+i", "Ctrl+Shift+r"]) {
      assert.match(bindingProblem(def("search"), chord, win, "windows") ?? "", /system/, chord);
    }
    assert.match(bindingProblem(def("search"), "Meta+q", mac, "macos") ?? "", /system/);
  });
  it("names the shortcut a chord already belongs to", () => {
    assert.match(bindingProblem(def("search"), "Ctrl+Shift+n", win, "windows") ?? "", /next agent/);
    assert.match(bindingProblem(def("orchestrator"), "Ctrl+Shift+c", win, "windows") ?? "", /Copy/);
    // Tab numbers live in detail views, which hold terminals; inbox keys don't clash with them.
    assert.match(bindingProblem(def("search"), "Ctrl+5", win, "windows") ?? "", /tab/);
    assert.equal(
      bindingProblem(def("inboxDismiss"), "Enter", win, "windows")?.includes("Open"),
      true
    );
    assert.equal(bindingProblem(def("inboxDismiss"), "x", win, "windows"), null);
  });
  it("lets the reply box's send-and-next take any modified chord, not bare keys", () => {
    assert.equal(bindingProblem(def("sendAndNext"), "Alt+Enter", win, "windows"), null);
    assert.match(bindingProblem(def("sendAndNext"), "s", win, "windows") ?? "", /modifier/);
  });
  it("records numbered shortcuts as #", () => {
    assert.equal(asBinding(def("detailTab"), "Alt+Meta+3"), "Alt+Meta+#");
    assert.equal(asBinding(def("search"), "Meta+3"), "Meta+3");
    assert.equal(bindingProblem(def("detailTab"), "Alt+Meta+#", mac, "macos"), null);
    assert.match(bindingProblem(def("detailTab"), "Meta+o", mac, "macos") ?? "", /number/);
  });
  it("flags clashes already in a keymap", () => {
    const clashing = effectiveKeymap({ search: ["Ctrl+Shift+j"] }, "windows");
    assert.deepEqual(findConflicts(clashing).get("search"), ["orchestrator"]);
  });
});
