import { useMemo, useState } from "react";
import { Switch } from "@/components/Switch";
import { useHint } from "@/platform/shortcuts";
import { useHintPrefs } from "@/platform/shortcuts/hintPrefs";
import { useKeymapStore } from "@/platform/shortcuts/keymap";
import { groupedShortcuts, shortcutDef } from "@/platform/shortcuts/registry";
import { findConflicts } from "@/platform/shortcuts/rules";
import { SettingRow } from "./SettingRow";
import { ShortcutRow } from "./ShortcutRow";

const GROUPED = groupedShortcuts();

// Settings → Shortcuts: every shortcut trace has, by where it works, in this OS's keys.
// Click a shortcut's keys to record new ones; built-in ones are listed but fixed.
export function ShortcutSettings() {
  const keymap = useKeymapStore((s) => s.keymap);
  const hasOverrides = useKeymapStore((s) => Object.keys(s.overrides).length > 0);
  const resetAll = useKeymapStore((s) => s.resetAll);
  const conflicts = useMemo(() => findConflicts(keymap), [keymap]);
  const [recording, setRecording] = useState<string | null>(null);
  const cheatKey = useHint("cheatSheet");
  const hintsOn = useHintPrefs((s) => s.onButtons);
  const setHintsOn = useHintPrefs((s) => s.setOnButtons);

  return (
    <>
      <section className="setting-group">
        <div className="sc-head">
          <h2>Shortcuts</h2>
          <button
            type="button"
            className="btn"
            disabled={!hasOverrides}
            onClick={() => {
              setRecording(null);
              resetAll();
            }}
            title={hasOverrides ? undefined : "Every shortcut has its default keys"}
          >
            Reset all
          </button>
        </div>
        <div className="desc">
          Click a shortcut's keys, then press new ones. Keys a terminal needs, and ones the system
          keeps, are refused. ? or {cheatKey} shows them all, wherever you are.
        </div>
        <SettingRow
          label="Show shortcut hints on buttons"
          hint="Puts each button's keys beside it, for learning them. Off, they're in its tooltip."
        >
          <Switch on={hintsOn} onChange={setHintsOn} label="Show shortcut hints on buttons" />
        </SettingRow>
      </section>
      {GROUPED.map((group) => (
        <section key={group.id} className="setting-group">
          <h2>{group.label}</h2>
          <div className="desc">{group.desc}</div>
          {group.shortcuts.map((def) => (
            <ShortcutRow
              key={def.id}
              def={def}
              clashesWith={(conflicts.get(def.id) ?? []).map((id) => shortcutDef(id)?.label ?? id)}
              isRecording={recording === def.id}
              setRecording={(on) => setRecording(on ? def.id : null)}
            />
          ))}
        </section>
      ))}
    </>
  );
}
