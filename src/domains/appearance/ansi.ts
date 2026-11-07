import type { ITheme } from "@xterm/xterm";

// A scheme's colours as a terminal would draw them, for the static previews
// in Settings → Appearance (no xterm instance per option). A scheme leaves out
// what it doesn't change, so missing ones fall back to xterm's own defaults —
// exactly what a real terminal would show.

export const ANSI_NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

export type AnsiName = (typeof ANSI_NAMES)[number];

/** xterm.js's default 16 colours and surfaces. */
const XTERM_DEFAULTS: Record<AnsiName | "background" | "foreground" | "cursor", string> = {
  black: "#2e3436",
  red: "#cc0000",
  green: "#4e9a06",
  yellow: "#c4a000",
  blue: "#3465a4",
  magenta: "#75507b",
  cyan: "#06989a",
  white: "#d3d7cf",
  brightBlack: "#555753",
  brightRed: "#ef2929",
  brightGreen: "#8ae234",
  brightYellow: "#fce94f",
  brightBlue: "#729fcf",
  brightMagenta: "#ad7fa8",
  brightCyan: "#34e2e2",
  brightWhite: "#eeeeec",
  background: "#000000",
  foreground: "#ffffff",
  cursor: "#ffffff",
};

export interface TermColors {
  background: string;
  foreground: string;
  cursor: string;
  ansi: Record<AnsiName, string>;
}

/** Every colour a preview needs, the scheme's own or xterm's default. */
export function termColors(theme: ITheme): TermColors {
  const ansi = {} as Record<AnsiName, string>;
  for (const name of ANSI_NAMES) ansi[name] = theme[name] ?? XTERM_DEFAULTS[name];
  const foreground = theme.foreground ?? XTERM_DEFAULTS.foreground;
  return {
    background: theme.background ?? XTERM_DEFAULTS.background,
    foreground,
    cursor: theme.cursor ?? foreground,
    ansi,
  };
}
