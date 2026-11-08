import { Switch } from "@/components/Switch";
import { isTabOn, OPTIONAL_TABS, useTabSettings } from "@/domains/panes/tabSettings";
import { SettingRow } from "./SettingRow";

// Settings → Tabs: the workspace tabs that come and go beside an agent, what each is
// for, and a switch for each. Off, a tab never shows (nor in the pane menu), and the
// agent tools that fill it aren't offered to agents.
export function TabsSettings() {
  const off = useTabSettings((s) => s.off);
  const setOn = useTabSettings((s) => s.setOn);
  return (
    <section className="setting-group">
      <h2>Tabs</h2>
      <div className="desc">
        Beside an agent's chat, these tabs show only when there's something in them. Open one
        yourself from a pane's ⋯ menu. Turn one off to never see it; agents then aren't given the
        tool that fills it.
      </div>
      {OPTIONAL_TABS.map((tab) => {
        const on = isTabOn(off, tab.id);
        const tools = tab.tools.length > 0 ? ` Agent tool: ${tab.tools.join(", ")}.` : "";
        return (
          <SettingRow key={tab.id} label={tab.label} hint={`${tab.about}${tools}`}>
            <Switch on={on} onChange={(next) => setOn(tab.id, next)} label={`Show ${tab.label}`} />
          </SettingRow>
        );
      })}
    </section>
  );
}
