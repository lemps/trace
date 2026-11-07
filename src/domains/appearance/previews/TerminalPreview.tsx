import type { CSSProperties, ReactNode } from "react";
import { type AnsiName, termColors } from "../ansi";
import type { CursorStyle } from "../prefs";
import { activeTheme, isMotionReduced, useAppearance } from "../store";
import { resolveTermScheme, type TermScheme } from "../terminalSchemes";

// Settings → Appearance → Terminal: a few lines a terminal might show — a
// prompt, test results in each ANSI colour, a cursor — painted as styled text
// in the scheme, font, size, line height and cursor that the real terminals
// use. Static on purpose: no xterm instance for a preview.

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
  const cursorColor = termColors(scheme.theme).cursor;
  const blink = s.prefs.cursorBlink && !isMotionReduced(s);
  return (
    <div inert aria-hidden="true">
      <TermSnippet
        scheme={scheme}
        style={
          {
            fontFamily,
            fontSize: fontSize / (s.appliedScale / 100),
            lineHeight,
            "--term-cursor": cursorColor,
          } as CSSProperties
        }
      >
        <div className="ap-term-line">
          <span>$ </span>
          <Cursor style={s.prefs.cursorStyle} blink={blink} />
        </div>
      </TermSnippet>
      <div className="ap-pv-caption">
        {scheme.label} · {fontSize}px · {lineHeight}
      </div>
    </div>
  );
}

/** Two lines and the colour row, for a scheme's thumbnail. */
export const THUMB_LINES: Seg[][] = [LINES[0], LINES[2]];
