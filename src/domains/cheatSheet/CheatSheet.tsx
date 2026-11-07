import { useMemo } from "react";
import type { NavId } from "@/app/nav";
import { Modal } from "@/components/Modal";
import { useSettingsTabRequest } from "@/domains/settings/tabStore";
import { currentOs } from "@/platform/os";
import { useKeymapStore } from "@/platform/shortcuts/keymap";
import { cheatSheetGroups } from "./rows";
import { useCheatSheet } from "./store";
import { useCheatSheetKeys } from "./useCheatSheetKeys";

// Every shortcut, grouped as Settings → Shortcuts groups them and with the user's
// rebindings, over whatever is on screen. `?` or Ctrl+/ (⌃/ on macOS), the rail's
// keyboard button or the palette's "Keyboard shortcuts" open it; Esc closes it.
export function CheatSheet({ onNav }: { onNav: (nav: NavId) => void }) {
  useCheatSheetKeys();
  const open = useCheatSheet((s) => s.open);
  const hide = useCheatSheet((s) => s.hide);
  const keymap = useKeymapStore((s) => s.keymap);
  const groups = useMemo(() => cheatSheetGroups(keymap, currentOs), [keymap]);
  if (!open) return null;

  const customize = () => {
    hide();
    useSettingsTabRequest.getState().request("shortcuts");
    onNav("settings");
  };

  return (
    <Modal
      title="Keyboard shortcuts"
      onClose={hide}
      className="cs-modal"
      footer={
        <div className="cs-foot">
          <span className="cs-note">Keys as bound now, rebindings included.</span>
          <button type="button" className="btn" onClick={customize}>
            Customize…
          </button>
        </div>
      }
    >
      <div className="cs-groups">
        {groups.map((g) => (
          <section key={g.id} className="cs-group" aria-labelledby={`cs-${g.id}`}>
            <h3 id={`cs-${g.id}`} className="cs-head">
              {g.label}
            </h3>
            <div className="cs-desc">{g.desc}</div>
            <dl className="cs-rows">
              {g.rows.map((row) => (
                <div key={row.id} className="cs-row">
                  <dt>{row.label}</dt>
                  <dd>
                    {row.keys.map((k) => (
                      <span key={k} className="kbd">
                        {k}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
