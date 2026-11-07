import { fontStack } from "./fontStack.ts";

// The "Chat & transcript" settings: how an agent's Markdown reads wherever it
// is shown (the chat view, the transcript, plan and question cards). They
// become custom properties on <html> (`chatStyleVars`), which the shared
// `.md.prose` class in styles/markdown.css reads, so every surface follows.
// Defaults reproduce the look from before these settings existed.

export type ProseWidth = "readable" | "wide" | "full";
export type ProseSpacing = "compact" | "standard" | "relaxed";
export type HeadingScale = "small" | "standard" | "large";
/** How tool calls first appear: folded into a turn's summary, one line each, or open. */
export type ToolActivity = "folded" | "lines" | "expanded";
export type CodeThemeId = "match" | "github-light" | "github-dark" | "solarized-light" | "nord";

export interface ChatStyle {
  /** A font family as typed ("" = the interface font). */
  textFont: string;
  /** Pixels; 0 = the interface's body size (which follows density). */
  textSize: number;
  /** A monospace family as typed ("" = Geist Mono). */
  codeFont: string;
  /** Pixels; 0 = in proportion to the text. */
  codeSize: number;
  lineHeight: number;
  width: ProseWidth;
  spacing: ProseSpacing;
  headings: HeadingScale;
  codeTheme: CodeThemeId;
  tools: ToolActivity;
}

export const DEFAULT_CHAT_STYLE: ChatStyle = {
  textFont: "",
  textSize: 0,
  codeFont: "",
  codeSize: 0,
  lineHeight: 1.6,
  width: "readable",
  spacing: "standard",
  headings: "standard",
  codeTheme: "match",
  tools: "folded",
};

export const TEXT_SIZE = { min: 11, max: 22 } as const;
export const CODE_SIZE = { min: 10, max: 20 } as const;
export const LINE_HEIGHTS = [1.4, 1.5, 1.6, 1.75, 1.9] as const;

export const CODE_THEMES: { id: CodeThemeId; label: string }[] = [
  { id: "match", label: "Match theme" },
  { id: "github-light", label: "GitHub Light" },
  { id: "github-dark", label: "GitHub Dark" },
  { id: "solarized-light", label: "Solarized" },
  { id: "nord", label: "Nord" },
];

const WIDTH: Record<ProseWidth, string> = { readable: "820px", wide: "1100px", full: "none" };
const GAP: Record<ProseSpacing, string> = { compact: "4px", standard: "8px", relaxed: "14px" };
/** h1 / h2 / h3 as multiples of the text size ("standard" is the old fixed 15 / 13.5px). */
const HEADINGS: Record<HeadingScale, [number, number, number]> = {
  small: [1, 1, 1],
  standard: [1.11, 1, 1],
  large: [1.5, 1.25, 1.1],
};

const oneOf =
  <T extends string>(...values: T[]) =>
  (v: unknown): v is T =>
    values.some((x) => x === v);

const isWidth = oneOf<ProseWidth>("readable", "wide", "full");
const isSpacing = oneOf<ProseSpacing>("compact", "standard", "relaxed");
const isHeadings = oneOf<HeadingScale>("small", "standard", "large");
const isTools = oneOf<ToolActivity>("folded", "lines", "expanded");
export const isCodeTheme = (v: unknown): v is CodeThemeId => CODE_THEMES.some((t) => t.id === v);
const isLineHeight = (v: unknown): v is number => LINE_HEIGHTS.some((h) => h === v);

/** A size in range, to the half pixel; 0 means "default" and is kept. */
function size(v: unknown, range: { min: number; max: number }, fallback: number): number {
  if (v === 0) return 0;
  if (typeof v !== "number" || !Number.isFinite(v) || v < range.min || v > range.max) {
    return fallback;
  }
  return Math.round(v * 2) / 2;
}

function font(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 200) : "";
}

/** Validate a stored value field by field; anything unknown falls back to its default. */
export function parseChatStyle(raw: unknown): ChatStyle {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_CHAT_STYLE;
  return {
    textFont: font(o.textFont),
    textSize: size(o.textSize, TEXT_SIZE, d.textSize),
    codeFont: font(o.codeFont),
    codeSize: size(o.codeSize, CODE_SIZE, d.codeSize),
    lineHeight: isLineHeight(o.lineHeight) ? o.lineHeight : d.lineHeight,
    width: isWidth(o.width) ? o.width : d.width,
    spacing: isSpacing(o.spacing) ? o.spacing : d.spacing,
    headings: isHeadings(o.headings) ? o.headings : d.headings,
    codeTheme: isCodeTheme(o.codeTheme) ? o.codeTheme : d.codeTheme,
    tools: isTools(o.tools) ? o.tools : d.tools,
  };
}

/**
 * A size field as typed: 0 when blank (the default), the number when it's in
 * range, or null while it isn't a usable value yet ("1" on the way to "14"),
 * so the input can keep what was typed without saving it.
 */
export function sizeFromInput(raw: string, range: { min: number; max: number }): number | null {
  const t = raw.trim();
  if (!t) return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < range.min || n > range.max) return null;
  return Math.round(n * 2) / 2;
}

/** The custom properties a style sets on <html>; "" means "remove, use the fallback". */
export function chatStyleVars(s: ChatStyle): Record<string, string> {
  const [h1, h2, h3] = HEADINGS[s.headings];
  return {
    "--chat-font": fontStack(s.textFont, "var(--font-sans)"),
    "--chat-size": s.textSize ? `${s.textSize}px` : "",
    "--chat-code-font": fontStack(s.codeFont, "var(--font-mono)"),
    "--chat-code-size": s.codeSize ? `${s.codeSize}px` : "",
    "--chat-line-height": String(s.lineHeight),
    "--chat-gap": GAP[s.spacing],
    "--chat-h1": String(h1),
    "--chat-h2": String(h2),
    "--chat-h3": String(h3),
    "--chat-col": WIDTH[s.width],
  };
}
