import { useMemo, useState } from "react";
import { useKeymapStore } from "@/platform/shortcuts/keymap";
import { GROUPS, SHORTCUTS, shortcutDef } from "@/platform/shortcuts/registry";
import { findConflicts } from "@/platform/shortcuts/rules";
import { ShortcutRow } from "./ShortcutRow";

// Settings → Shortcuts: every shortcut trace has, by where it works, in this OS's keys.
// Click a shortcut's keys to record new ones; built-in ones are listed but fixed.
export function ShortcutSettings() {
  const keymap = useKeymapStore((s) => s.keymap);
  const hasOverrides = useKeymapStore((s) => Object.keys(s.overrides).length > 0);
  const resetAll = useKeymapStore((s) => s.resetAll);
  const conflicts = useMemo(() => findConflicts(keymap), [keymap]);
  const [recording, setRecording] = useState<string | null>(null);

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
          keeps, are refused.
        </div>
      </section>
      {GROUPS.map((group) => (
        <section key={group.id} className="setting-group">
          <h2>{group.label}</h2>
          <div className="desc">{group.desc}</div>
          {SHORTCUTS.filter((s) => s.group === group.id).map((def) => (
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
