import { useState } from "react";
import { FontField } from "@/components/FontField";
import { Segmented } from "@/components/Segmented";
import { Switch } from "@/components/Switch";
import { setTermFont, setTermFontSize, setTermLineHeight } from "@/domains/agent/terminalPrefs";
import { applyTerminalPrefs } from "@/domains/agent/terminalRegistry";
import { installedOnly, UI_FONT_SUGGESTIONS } from "@/domains/appearance/installedFonts";
import { type Density, UI_SCALES } from "@/domains/appearance/prefs";
import { useAppearance } from "@/domains/appearance/store";
import { AccentPicker, ThemePicker } from "@/domains/appearance/ThemePicker";
import { SettingRow } from "./SettingRow";
import { TerminalAppearance } from "./TerminalAppearance";

const DENSITIES: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "comfortable", label: "Comfortable" },
];
const SCALES = UI_SCALES.map((s) => ({ value: s, label: `${s}%` }));

// Settings → Appearance: theme, accent, text and layout, terminal, motion.
// Every control writes the appearance store, which applies itself live
// (domains/appearance/apply.ts) and persists.
export function AppearanceSettings() {
  const prefs = useAppearance((s) => s.prefs);
  const systemReducedMotion = useAppearance((s) => s.systemReducedMotion);
  const update = useAppearance((s) => s.update);
  const reset = useAppearance((s) => s.reset);
  const [resets, setResets] = useState(0);
  // Measured once per visit: only suggestions this machine can show.
  const [uiFonts] = useState(() => installedOnly(UI_FONT_SUGGESTIONS));

  const resetAll = () => {
    setTermFont("");
    setTermFontSize("");
    setTermLineHeight("");
    reset();
    applyTerminalPrefs();
    setResets((n) => n + 1);
  };

  return (
    <div className="ap-page">
      <section className="setting-group">
        <h2>Theme</h2>
        <div className="desc">Colours for the whole app. Changes apply as you pick them.</div>
        <ThemePicker />
        <SettingRow
          label="Accent"
          hint="Focus, selection and highlights. Amber, blue and green stay reserved for agent state."
        >
          <AccentPicker />
        </SettingRow>
      </section>

      <section className="setting-group">
        <h2>Text and layout</h2>
        <div className="desc">How large and how dense the interface is.</div>
        <SettingRow label="Interface size" hint="Zooms everything but the terminals.">
          <Segmented
            className="ap-seg"
            label="Interface size"
            value={prefs.uiScale}
            options={SCALES}
            onChange={(uiScale) => update({ uiScale })}
          />
        </SettingRow>
        <SettingRow label="Density" hint="Control heights and text size in lists and toolbars.">
          <Segmented
            className="ap-seg"
            label="Density"
            value={prefs.density}
            options={DENSITIES}
            onChange={(density) => update({ density })}
          />
        </SettingRow>
        <SettingRow label="Font" hint="Any installed font. Blank uses Geist.">
          <FontField
            label="Interface font"
            value={prefs.uiFont}
            onChange={(uiFont) => update({ uiFont })}
            suggestions={uiFonts}
            defaultFamily="Geist"
          />
        </SettingRow>
      </section>

      <TerminalAppearance key={resets} />

      <section className="setting-group">
        <h2>Motion</h2>
        <SettingRow
          label="Reduce motion"
          hint={
            systemReducedMotion
              ? "Your system asks for reduced motion, so it's on. Change it in the OS settings."
              : "Stops spinners, blinking, slides and the buddy's animation."
          }
        >
          <Switch
            on={prefs.motion === "reduce" || systemReducedMotion}
            onChange={(on) => update({ motion: on ? "reduce" : "system" })}
            label="Reduce motion"
            disabled={systemReducedMotion}
          />
        </SettingRow>
      </section>

      <div className="ap-reset">
        <button type="button" className="btn" onClick={resetAll}>
          Reset appearance
        </button>
      </div>
    </div>
  );
}
