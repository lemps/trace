import { useState } from "react";
import { Switch } from "@/components/Switch";
import {
  DEFAULT_TERM_FONT_SIZE,
  DEFAULT_TERM_LINE_HEIGHT,
  setTermFont,
  setTermFontSize,
  setTermLineHeight,
  termFontRaw,
  termFontSizeRaw,
  termLineHeightRaw,
} from "@/domains/agent/terminalPrefs";
import { applyTerminalPrefs } from "@/domains/agent/terminalRegistry";
import type { CursorStyle } from "@/domains/appearance/prefs";
import { Segmented } from "@/domains/appearance/Segmented";
import { isMotionReduced, useAppearance } from "@/domains/appearance/store";
import { isTermSchemeChoice, TERM_SCHEMES } from "@/domains/appearance/terminalSchemes";
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

  return (
    <section className="setting-group">
      <h2>Terminal</h2>
      <div className="desc">
        The agent chat and shell terminals. Changes apply to open terminals immediately.
      </div>
      <SettingRow
        label="Colour scheme"
        hint="Claude Code chooses its own colours too: run /theme in a session to match a light scheme."
      >
        <select
          aria-label="Terminal colour scheme"
          value={prefs.termScheme}
          onChange={(e) => {
            const v = e.target.value;
            if (isTermSchemeChoice(v)) update({ termScheme: v });
          }}
        >
          <option value="match">Match theme</option>
          {TERM_SCHEMES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </SettingRow>
      <SettingRow label="Font" hint="Any installed monospace font; missing glyphs fall back.">
        <input
          type="text"
          aria-label="Terminal font"
          placeholder="Geist Mono"
          value={font}
          onChange={(e) => changeFont(e.target.value)}
        />
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
    </section>
  );
}
