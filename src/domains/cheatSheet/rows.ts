import type { Os } from "../../platform/os.ts";
import { formatChord } from "../../platform/shortcuts/chord.ts";
import { type GroupId, groupedShortcuts } from "../../platform/shortcuts/registry.ts";

// The cheat sheet's contents: the same groups, in the same order, as Settings →
// Shortcuts (`groupedShortcuts`), each shortcut with its keys as bound now.

export interface CheatRow {
  id: string;
  label: string;
  /** Each chord as this OS writes it ("⌘K", "Ctrl+Shift+K"). */
  keys: string[];
}

export interface CheatGroup {
  id: GroupId;
  label: string;
  desc: string;
  rows: CheatRow[];
}

export function cheatSheetGroups(keymap: Record<string, string[]>, os: Os): CheatGroup[] {
  return groupedShortcuts().map((g) => ({
    id: g.id,
    label: g.label,
    desc: g.desc,
    rows: g.shortcuts.map((def) => ({
      id: def.id,
      label: def.label,
      keys: (keymap[def.id] ?? []).map((c) => formatChord(c, os)),
    })),
  }));
}
