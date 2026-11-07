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
  const groups = groupedShortcuts();
  // A shortcut that's another way to do the same thing (`sameAs`) adds its keys to
  // that shortcut's row rather than repeating the label on a row of its own.
  const extra = new Map<string, string[]>();
  for (const def of groups.flatMap((g) => g.shortcuts)) {
    if (def.sameAs) extra.set(def.sameAs, [...(extra.get(def.sameAs) ?? []), def.id]);
  }
  const keysOf = (id: string) => (keymap[id] ?? []).map((c) => formatChord(c, os));
  return groups.map((g) => ({
    id: g.id,
    label: g.label,
    desc: g.desc,
    rows: g.shortcuts
      .filter((def) => !def.sameAs)
      .map((def) => ({
        id: def.id,
        label: def.label,
        keys: [...keysOf(def.id), ...(extra.get(def.id) ?? []).flatMap(keysOf)],
      })),
  }));
}
