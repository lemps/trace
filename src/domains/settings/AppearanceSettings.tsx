import { useState } from "react";
import { Switch } from "@/components/Switch";
import { setTermFont, setTermFontSize, setTermLineHeight } from "@/domains/agent/terminalPrefs";
import { applyTerminalPrefs } from "@/domains/agent/terminalRegistry";
import { type Density, UI_SCALES } from "@/domains/appearance/prefs";
import { Segmented } from "@/domains/appearance/Segmented";
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
// Suggestions only — any installed family can be typed.
const UI_FONTS = ["Geist", "Inter", "Segoe UI", "SF Pro Text", "Helvetica Neue", "system-ui"];

// Settings → Appearance: theme, accent, text and layout, terminal, motion.
// Every control writes the appearance store, which applies itself live
// (domains/appearance/apply.ts) and persists.
export function AppearanceSettings() {
  const prefs = useAppearance((s) => s.prefs);
  const systemReducedMotion = useAppearance((s) => s.systemReducedMotion);
  const update = useAppearance((s) => s.update);
  const reset = useAppearance((s) => s.reset);
  const [resets, setResets] = useState(0);

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
            label="Interface size"
            value={prefs.uiScale}
            options={SCALES}
            onChange={(uiScale) => update({ uiScale })}
          />
        </SettingRow>
        <SettingRow label="Density" hint="Control heights and text size in lists and toolbars.">
          <Segmented
            label="Density"
            value={prefs.density}
            options={DENSITIES}
            onChange={(density) => update({ density })}
          />
        </SettingRow>
        <SettingRow label="Font" hint="Any installed font. Blank uses Geist.">
          <input
            type="text"
            aria-label="Interface font"
            placeholder="Geist"
            list="ap-ui-fonts"
            value={prefs.uiFont}
            onChange={(e) => update({ uiFont: e.target.value })}
          />
          <datalist id="ap-ui-fonts">
            {UI_FONTS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </SettingRow>
      </section>

      <TerminalAppearance key={resets} />

      <section className="setting-group">
        <h2>Motion</h2>
        <SettingRow
          label="Reduce motion"
          hint={
            systemReducedMotion
              ? "Your system already asks for reduced motion, so it's on."
              : "Stops spinners, blinking, slides and the buddy's animation."
          }
        >
          <Switch
            on={prefs.motion === "reduce" || systemReducedMotion}
            onChange={(on) => update({ motion: on ? "reduce" : "system" })}
            label="Reduce motion"
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
