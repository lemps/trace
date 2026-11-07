import { useState } from "react";
import { Segmented } from "@/components/Segmented";
import { StatusLight } from "@/components/StatusLight";
import { Switch } from "@/components/Switch";
import { setTermFont, setTermFontSize, setTermLineHeight } from "@/domains/agent/terminalPrefs";
import { applyTerminalPrefs } from "@/domains/agent/terminalRegistry";
import { UI_FONT_SUGGESTIONS } from "@/domains/appearance/fontStack";
import { type Density, UI_SCALES } from "@/domains/appearance/prefs";
import { AppPreview } from "@/domains/appearance/previews/AppPreview";
import { TextPreview } from "@/domains/appearance/previews/TextPreview";
import { useAppearance } from "@/domains/appearance/store";
import { AccentPicker, ThemePicker } from "@/domains/appearance/ThemePicker";
import { AppearanceGroup } from "./AppearanceGroup";
import { ChatAppearance } from "./ChatAppearance";
import { SettingRow } from "./SettingRow";
import { TerminalAppearance } from "./TerminalAppearance";

const DENSITIES: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "comfortable", label: "Comfortable" },
];
const SCALES = UI_SCALES.map((s) => ({ value: s, label: `${s}%` }));

// Settings → Appearance: theme, accent, text and layout, terminal, chat &
// transcript, motion. Every control writes the appearance store, which applies
// itself live (domains/appearance/apply.ts) and persists; each group shows a
// live preview of what it changes beside it.
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
      <AppearanceGroup
        title="Theme"
        desc="Colours for the whole app. Changes apply as you pick them."
        preview={<AppPreview />}
      >
        <ThemePicker />
        <SettingRow
          label="Accent"
          hint="Focus, selection and highlights. Amber, blue and green stay reserved for agent state."
        >
          <AccentPicker />
        </SettingRow>
      </AppearanceGroup>

      <AppearanceGroup
        title="Text and layout"
        desc="How large and how dense the interface is."
        preview={<TextPreview />}
      >
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
          <input
            type="text"
            aria-label="Interface font"
            placeholder="Geist"
            list="ap-ui-fonts"
            value={prefs.uiFont}
            onChange={(e) => update({ uiFont: e.target.value })}
          />
          <datalist id="ap-ui-fonts">
            {UI_FONT_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </SettingRow>
      </AppearanceGroup>

      <TerminalAppearance key={resets} />
      <ChatAppearance key={`chat${resets}`} />

      <AppearanceGroup
        title="Motion"
        preview={
          <div className="ap-motion-pv" inert aria-hidden="true">
            <StatusLight light="working" variant="pill" />
            <StatusLight light="attention" variant="pill" />
          </div>
        }
      >
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
      </AppearanceGroup>

      <div className="ap-reset">
        <button type="button" className="btn" onClick={resetAll}>
          Reset appearance
        </button>
      </div>
    </div>
  );
}
