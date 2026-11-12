import type { CSSProperties, ReactNode } from "react";
import { type AnsiName, termColors } from "../ansi";
import type { CursorStyle } from "../prefs";
import { activeTheme, isMotionReduced, useAppearance } from "../store";
import { resolveTermScheme, type TermScheme } from "../terminalSchemes";
import { PreviewFrame } from "./PreviewFrame";

// Settings → Appearance → Terminal: a few lines a terminal might show — a
// prompt, test results in each ANSI colour, a cursor — painted as styled text
// in the scheme, font, size, line height and cursor that the real terminals
// use. Static on purpose: no xterm instance for a preview. It sits in a fixed
// frame, so a bigger font shows fewer lines, as a real terminal would.

interface TerminalPreviewProps {
  fontFamily: string;
  /** Pixels, as the terminal draws them (the interface zoom is undone, as there). */
  fontSize: number;
  lineHeight: number;
}

type Seg = [AnsiName | "fg", string];

const LINES: Seg[][] = [
  [
    ["green", "~/trace"],
    ["blue", " main"],
    ["fg", " $ npm test"],
  ],
  [
    ["brightGreen", " ✓"],
    ["fg", " prefs "],
    ["brightBlack", "validates values"],
  ],
  [
    ["brightRed", " ✗"],
    ["fg", " chat  "],
    ["red", "2 failing"],
  ],
  [
    ["yellow", " !"],
    ["fg", " warn  "],
    ["brightYellow", "1 skipped"],
  ],
  [
    ["magenta", " i"],
    ["fg", " info  "],
    ["cyan", "watching src/"],
  ],
];

/** The full preview's extra lines, after the sample (so the frame starts full). */
const MORE: Seg[][] = [
  [["fg", ""]],
  [
    ["brightBlack", " Tests  "],
    ["green", "12 passed"],
    ["fg", " | "],
    ["red", "2 failed"],
    ["fg", " (14)"],
  ],
  [
    ["brightBlack", " Time   "],
    ["fg", "1.84s"],
  ],
  [
    ["green", "~/trace"],
    ["blue", " main"],
    ["fg", " $ git status --short"],
  ],
  [
    ["yellow", " M"],
    ["fg", " src/domains/appearance/apply.ts"],
  ],
  [
    ["green", "A "],
    ["fg", " src/domains/appearance/zoom.ts"],
  ],
];

function Cursor({ style, blink }: { style: CursorStyle; blink: boolean }) {
  return <span className={`ap-term-cursor ${style}${blink ? " blink" : ""}`} />;
}

/** The snippet in one scheme: also the thumbnail of each scheme choice (small, no cursor). */
export function TermSnippet({
  scheme,
  style,
  children,
  lines = LINES,
}: {
  scheme: TermScheme;
  style?: CSSProperties;
  children?: ReactNode;
  lines?: Seg[][];
}) {
  const c = termColors(scheme.theme);
  return (
    <div className="ap-term" style={{ background: c.background, color: c.foreground, ...style }}>
      {lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed sample lines
        <div key={i} className="ap-term-line">
          {line.map(([color, text], j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed sample segments
            <span key={j} style={color === "fg" ? undefined : { color: c.ansi[color] }}>
              {text}
            </span>
          ))}
        </div>
      ))}
      {children}
    </div>
  );
}

export function TerminalPreview({ fontFamily, fontSize, lineHeight }: TerminalPreviewProps) {
  const s = useAppearance();
  const scheme = resolveTermScheme(s.prefs.termScheme, activeTheme(s));
  const colors = termColors(scheme.theme);
  const blink = s.prefs.cursorBlink && !isMotionReduced(s);
  return (
    <PreviewFrame
      kind="terminal"
      style={{ background: colors.background }}
      caption={`${scheme.label} · ${fontSize}px · ${lineHeight}`}
    >
      <TermSnippet
        scheme={scheme}
        lines={[...LINES, ...MORE]}
        style={
          {
            background: "none",
            fontFamily,
            fontSize: fontSize / (s.appliedScale / 100),
            lineHeight,
            "--term-cursor": colors.cursor,
          } as CSSProperties
        }
      >
        <div className="ap-term-line">
          <span>$ </span>
          <Cursor style={s.prefs.cursorStyle} blink={blink} />
        </div>
      </TermSnippet>
    </PreviewFrame>
  );
}

/** Two lines and the colour row, for a scheme's thumbnail. */
export const THUMB_LINES: Seg[][] = [LINES[0], LINES[2]];
