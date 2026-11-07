import { useState } from "react";
import { Segmented } from "@/components/Segmented";
import { CodeThemePicker } from "@/domains/appearance/CodeThemePicker";
import {
  CODE_SIZE,
  type HeadingScale,
  LINE_HEIGHTS,
  type ProseSpacing,
  type ProseWidth,
  sizeFromInput,
  TEXT_SIZE,
  type ToolActivity,
} from "@/domains/appearance/chatStyle";
import { MONO_FONT_SUGGESTIONS, UI_FONT_SUGGESTIONS } from "@/domains/appearance/fontStack";
import { ChatPreview } from "@/domains/appearance/previews/ChatPreview";
import { useAppearance } from "@/domains/appearance/store";
import { AppearanceGroup } from "./AppearanceGroup";
import { SettingRow } from "./SettingRow";

const WIDTHS: { value: ProseWidth; label: string }[] = [
  { value: "readable", label: "Readable" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];
const SPACINGS: { value: ProseSpacing; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "relaxed", label: "Relaxed" },
];
const HEADINGS: { value: HeadingScale; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
];
const TOOLS: { value: ToolActivity; label: string }[] = [
  { value: "folded", label: "Folded" },
  { value: "lines", label: "One line each" },
  { value: "expanded", label: "Expanded" },
];
const LINE_OPTIONS = LINE_HEIGHTS.map((h) => ({ value: h, label: String(h) }));

interface SizeFieldProps {
  label: string;
  value: number;
  range: { min: number; max: number };
  placeholder: string;
  onChange: (px: number) => void;
}

/** A px size typed freely; only a blank (default) or in-range value is saved. */
function SizeField({ label, value, range, placeholder, onChange }: SizeFieldProps) {
  const [raw, setRaw] = useState(value ? String(value) : "");
  const parsed = sizeFromInput(raw, range);
  return (
    <input
      type="number"
      aria-label={label}
      aria-invalid={parsed === null}
      min={range.min}
      max={range.max}
      step={0.5}
      placeholder={placeholder}
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        const next = sizeFromInput(e.target.value, range);
        if (next !== null) onChange(next);
      }}
    />
  );
}

// Appearance → Chat & transcript: how an agent's Markdown reads in the chat
// view, the terminal's transcript view and their cards. Every value is a
// custom property the shared `.md.prose` class reads (styles/markdown.css), so
// all of them change together. Reset remounts it so the size inputs re-read.
export function ChatAppearance() {
  const chat = useAppearance((s) => s.prefs.chat);
  const updateChat = useAppearance((s) => s.updateChat);
  return (
    <AppearanceGroup
      title="Chat & transcript"
      desc="How agent replies, thinking, plans and questions read, in the chat and the transcript."
      preview={<ChatPreview />}
    >
      <SettingRow label="Text font" hint="Any installed font. Blank uses the interface font.">
        <input
          type="text"
          aria-label="Chat text font"
          placeholder="Interface font"
          list="ap-chat-fonts"
          value={chat.textFont}
          onChange={(e) => updateChat({ textFont: e.target.value })}
        />
        <datalist id="ap-chat-fonts">
          {UI_FONT_SUGGESTIONS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </SettingRow>
      <SettingRow
        label="Text size"
        hint={`Pixels, ${TEXT_SIZE.min}–${TEXT_SIZE.max}. Blank follows the interface (density).`}
      >
        <SizeField
          label="Chat text size"
          value={chat.textSize}
          range={TEXT_SIZE}
          placeholder="Default"
          onChange={(textSize) => updateChat({ textSize })}
        />
      </SettingRow>
      <SettingRow label="Code font" hint="Inline code and code blocks. Blank uses Geist Mono.">
        <input
          type="text"
          aria-label="Chat code font"
          placeholder="Geist Mono"
          list="ap-chat-mono-fonts"
          value={chat.codeFont}
          onChange={(e) => updateChat({ codeFont: e.target.value })}
        />
        <datalist id="ap-chat-mono-fonts">
          {MONO_FONT_SUGGESTIONS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </SettingRow>
      <SettingRow
        label="Code size"
        hint={`Pixels, ${CODE_SIZE.min}–${CODE_SIZE.max}. Blank keeps it in proportion to the text.`}
      >
        <SizeField
          label="Chat code size"
          value={chat.codeSize}
          range={CODE_SIZE}
          placeholder="Auto"
          onChange={(codeSize) => updateChat({ codeSize })}
        />
      </SettingRow>
      <SettingRow label="Line height" hint="Space between the lines of a paragraph.">
        <Segmented
          className="ap-seg"
          label="Line height"
          value={chat.lineHeight}
          options={LINE_OPTIONS}
          onChange={(lineHeight) => updateChat({ lineHeight })}
        />
      </SettingRow>
      <SettingRow label="Paragraph spacing" hint="Space between paragraphs, lists and blocks.">
        <Segmented
          className="ap-seg"
          label="Paragraph spacing"
          value={chat.spacing}
          options={SPACINGS}
          onChange={(spacing) => updateChat({ spacing })}
        />
      </SettingRow>
      <SettingRow label="Headings" hint="How much larger headings are than the text.">
        <Segmented
          className="ap-seg"
          label="Heading scale"
          value={chat.headings}
          options={HEADINGS}
          onChange={(headings) => updateChat({ headings })}
        />
      </SettingRow>
      <SettingRow
        label="Column width"
        hint="Readable keeps lines short enough to scan; Full uses the whole pane."
      >
        <Segmented
          className="ap-seg"
          label="Column width"
          value={chat.width}
          options={WIDTHS}
          onChange={(width) => updateChat({ width })}
        />
      </SettingRow>
      <SettingRow
        label="Tool activity"
        hint="How tool calls first show: folded into one line per turn, a line per call, or open."
      >
        <Segmented
          className="ap-seg"
          label="Tool activity"
          value={chat.tools}
          options={TOOLS}
          onChange={(tools) => updateChat({ tools })}
        />
      </SettingRow>
      <div className="ap-sub">
        <div className="label">Code theme</div>
        <div className="hint">Colours for code blocks. Match theme follows the app theme.</div>
      </div>
      <CodeThemePicker />
    </AppearanceGroup>
  );
}
