// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveKeymap,
  GROUPS,
  groupedShortcuts,
  SHORTCUTS,
} from "../../platform/shortcuts/registry.ts";
import { cheatSheetGroups } from "./rows.ts";

describe("cheatSheetGroups", () => {
  it("lists Settings → Shortcuts' groups, in its order", () => {
    const groups = cheatSheetGroups(effectiveKeymap({}, "windows"), "windows");
    assert.deepEqual(
      groups.map((g) => g.id),
      groupedShortcuts().map((g) => g.id)
    );
    // Only groups with shortcuts, but in GROUPS' order.
    const order = GROUPS.map((g) => g.id);
    const at = groups.map((g) => order.indexOf(g.id));
    assert.deepEqual(
      at,
      [...at].sort((a, b) => a - b)
    );
  });
  it("lists every shortcut exactly once, under its own group", () => {
    const groups = cheatSheetGroups(effectiveKeymap({}, "macos"), "macos");
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
    // A `sameAs` shortcut is shown on its twin's row, not its own.
    const own = SHORTCUTS.filter((s) => !s.sameAs).map((s) => s.id);
    assert.deepEqual([...ids].sort(), own.sort());
    for (const g of groups) {
      for (const r of g.rows) assert.equal(SHORTCUTS.find((s) => s.id === r.id)?.group, g.id);
    }
  });
  it("shows the user's rebindings, as this OS writes them", () => {
    const keymap = effectiveKeymap({ orchestrator: ["Ctrl+Shift+o"] }, "windows");
    const row = cheatSheetGroups(keymap, "windows")
      .flatMap((g) => g.rows)
      .find((r) => r.id === "orchestrator");
    assert.deepEqual(row?.keys, ["Ctrl+Shift+O"]);
    const mac = cheatSheetGroups(effectiveKeymap({}, "macos"), "macos")
      .flatMap((g) => g.rows)
      .find((r) => r.id === "search");
    assert.deepEqual(mac?.keys, ["⌘/", "⌘K"]);
  });
});

it("a shortcut that's another way to do the same thing shares its row", () => {
  const groups = cheatSheetGroups(effectiveKeymap({}, "windows"), "windows");
  const rows = groups.flatMap((g) => g.rows);
  assert.equal(rows.filter((r) => r.label.startsWith("Show keyboard shortcuts")).length, 1);
  const row = rows.find((r) => r.id === "cheatSheet");
  assert.ok(row?.keys.includes("?"));
});
