import { useState } from "react";
import { Segmented } from "@/components/Segmented";
import { Switch } from "@/components/Switch";
import {
  DEFAULT_TERM_FONT_SIZE,
  DEFAULT_TERM_LINE_HEIGHT,
  setTermFont,
  setTermFontSize,
  setTermLineHeight,
  termFontFamily,
  termFontRaw,
  termFontSize,
  termFontSizeRaw,
  termLineHeight,
  termLineHeightRaw,
} from "@/domains/agent/terminalPrefs";
import { applyTerminalPrefs } from "@/domains/agent/terminalRegistry";
import { MONO_FONT_SUGGESTIONS } from "@/domains/appearance/fontStack";
import type { CursorStyle } from "@/domains/appearance/prefs";
import { TerminalPreview } from "@/domains/appearance/previews/TerminalPreview";
import { isMotionReduced, useAppearance } from "@/domains/appearance/store";
import { TermSchemePicker } from "@/domains/appearance/TermSchemePicker";
import { AppearanceGroup } from "./AppearanceGroup";
import { SettingRow } from "./SettingRow";

const CURSORS: { value: CursorStyle; label: string }[] = [
  { value: "block", label: "Block" },
  { value: "bar", label: "Bar" },
  { value: "underline", label: "Underline" },
];

// Appearance → Terminal: colours, font and cursor of the agent chat and shell
// terminals. Every change is pushed into the live terminals immediately (they
// survive navigation in the registry, so there's no "next terminal" to wait for).
// Reset remounts it (a new key) so the font inputs re-read their cleared values.
export function TerminalAppearance() {
  const prefs = useAppearance((s) => s.prefs);
  const update = useAppearance((s) => s.update);
  const reduced = useAppearance(isMotionReduced);
  const [font, setFont] = useState(termFontRaw);
  const [size, setSize] = useState(termFontSizeRaw);
  const [lineHeight, setLineHeight] = useState(termLineHeightRaw);

  const changeFont = (next: string) => {
    setFont(next);
    setTermFont(next);
    applyTerminalPrefs();
  };
  const changeSize = (next: string) => {
    setSize(next);
    setTermFontSize(next);
    applyTerminalPrefs();
  };
  const changeLineHeight = (next: string) => {
    setLineHeight(next);
    setTermLineHeight(next);
    applyTerminalPrefs();
  };

  // The inputs above have just written these, so they're current for the preview.
  const preview = (
    <TerminalPreview
      fontFamily={termFontFamily()}
      fontSize={termFontSize()}
      lineHeight={termLineHeight()}
    />
  );

  return (
    <AppearanceGroup
      title="Terminal"
      desc="The agent chat and shell terminals. Changes apply to open terminals immediately."
      preview={preview}
    >
      <div className="ap-sub">
        <div className="label">Colour scheme</div>
        <div className="hint">
          Claude Code chooses its own colours too: run /theme in a session to match a light scheme.
        </div>
      </div>
      <TermSchemePicker />
      <SettingRow label="Font" hint="Any installed monospace font; missing glyphs fall back.">
        <input
          type="text"
          aria-label="Terminal font"
          placeholder="Geist Mono"
          list="ap-mono-fonts"
          value={font}
          onChange={(e) => changeFont(e.target.value)}
        />
        <datalist id="ap-mono-fonts">
          {MONO_FONT_SUGGESTIONS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </SettingRow>
      <SettingRow
        label="Font size"
        hint={`Pixels, 8–32. Blank uses ${DEFAULT_TERM_FONT_SIZE}. Interface size doesn't change it.`}
      >
        <input
          type="number"
          aria-label="Terminal font size"
          min={8}
          max={32}
          step={1}
          placeholder={String(DEFAULT_TERM_FONT_SIZE)}
          value={size}
          onChange={(e) => changeSize(e.target.value)}
        />
      </SettingRow>
      <SettingRow label="Line height" hint="1–2; a little extra (1.1–1.3) reads less cramped.">
        <input
          type="number"
          aria-label="Terminal line height"
          min={1}
          max={2}
          step={0.05}
          placeholder={String(DEFAULT_TERM_LINE_HEIGHT)}
          value={lineHeight}
          onChange={(e) => changeLineHeight(e.target.value)}
        />
      </SettingRow>
      <SettingRow label="Cursor" hint="Most visible in the shell; Claude Code draws its own.">
        <Segmented
          className="ap-seg"
          label="Cursor style"
          value={prefs.cursorStyle}
          options={CURSORS}
          onChange={(cursorStyle) => update({ cursorStyle })}
        />
      </SettingRow>
      <SettingRow
        label="Blinking cursor"
        hint={reduced ? "Paused while motion is reduced." : "Blink the cursor in every terminal."}
      >
        <Switch
          on={prefs.cursorBlink}
          onChange={(cursorBlink) => update({ cursorBlink })}
          label="Blinking cursor"
        />
      </SettingRow>
    </AppearanceGroup>
  );
}
