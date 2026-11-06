import type { ITheme } from "@xterm/xterm";
import type { ThemeId } from "./themes";

// Terminal colour schemes. xterm paints to a canvas and can't read CSS
// variables, so these are literal colours — the one place outside the
// stylesheets that holds any. Each app theme has a matching scheme, picked by
// "Match theme"; any scheme can also be chosen on its own.
//
// The 16 ANSI colours are tuned per background: on the light schemes "white"
// is a mid grey and "bright white" near-black, or text a CLI prints in white
// would vanish.

export type TermSchemeId = ThemeId | "contrast";
/** The setting: follow the app theme, or a fixed scheme. */
export type TermSchemeChoice = "match" | TermSchemeId;

export interface TermScheme {
  id: TermSchemeId;
  label: string;
  theme: ITheme;
}

export const TERM_SCHEMES: TermScheme[] = [
  {
    id: "dark",
    label: "Dark",
    // Mirrors tokens.css (--bg-0 / --fg-1); ANSI stays xterm's default palette,
    // which is what trace's terminals always used.
    theme: { background: "#050505", foreground: "#ededed", cursor: "#ededed" },
  },
  {
    id: "midnight",
    label: "Midnight",
    theme: {
      background: "#080c16",
      foreground: "#e1e7f2",
      cursor: "#e1e7f2",
      cursorAccent: "#080c16",
      selectionBackground: "#32405f",
      black: "#3a4560",
      red: "#ec6a77",
      green: "#8fcf7a",
      yellow: "#e8c46a",
      blue: "#6fa8f5",
      magenta: "#c39af2",
      cyan: "#6fd3d8",
      white: "#c8d0e0",
      brightBlack: "#56627f",
      brightRed: "#ff8a95",
      brightGreen: "#a9e293",
      brightYellow: "#f5d68a",
      brightBlue: "#93c0ff",
      brightMagenta: "#d6b4ff",
      brightCyan: "#93e6ea",
      brightWhite: "#f3f6fc",
    },
  },
  {
    id: "light",
    label: "Light",
    theme: {
      background: "#ffffff",
      foreground: "#1f1f23",
      cursor: "#1f1f23",
      cursorAccent: "#ffffff",
      selectionBackground: "#d6d0f0",
      black: "#1f1f23",
      red: "#c4262e",
      green: "#2a7a2e",
      yellow: "#8a6100",
      blue: "#1f5fc4",
      magenta: "#8c3aa8",
      cyan: "#0f7680",
      white: "#6b6b73",
      brightBlack: "#6b6b73",
      brightRed: "#d93a3f",
      brightGreen: "#348c39",
      brightYellow: "#9e7200",
      brightBlue: "#2f6fd6",
      brightMagenta: "#9e4cba",
      brightCyan: "#168791",
      brightWhite: "#27272a",
    },
  },
  {
    id: "paper",
    label: "Paper",
    theme: {
      background: "#fdfaf3",
      foreground: "#2d281f",
      cursor: "#2d281f",
      cursorAccent: "#fdfaf3",
      selectionBackground: "#eadcbf",
      black: "#2d281f",
      red: "#b4372b",
      green: "#4f7a1e",
      yellow: "#8f6400",
      blue: "#2d5f9a",
      magenta: "#8a4593",
      cyan: "#2a7a76",
      white: "#6e6555",
      brightBlack: "#8a806e",
      brightRed: "#c9483a",
      brightGreen: "#5f8f27",
      brightYellow: "#a37500",
      brightBlue: "#3a72b0",
      brightMagenta: "#9c56a6",
      brightCyan: "#348c87",
      brightWhite: "#1c1810",
    },
  },
  {
    id: "contrast",
    label: "High contrast",
    theme: {
      background: "#000000",
      foreground: "#ffffff",
      cursor: "#ffffff",
      cursorAccent: "#000000",
      selectionBackground: "#4a4a4a",
      black: "#000000",
      red: "#ff5555",
      green: "#55ff55",
      yellow: "#ffff55",
      blue: "#6b8cff",
      magenta: "#ff55ff",
      cyan: "#55ffff",
      white: "#d0d0d0",
      brightBlack: "#808080",
      brightRed: "#ff8080",
      brightGreen: "#80ff80",
      brightYellow: "#ffff80",
      brightBlue: "#9fb4ff",
      brightMagenta: "#ff80ff",
      brightCyan: "#80ffff",
      brightWhite: "#ffffff",
    },
  },
];

export function isTermSchemeChoice(v: unknown): v is TermSchemeChoice {
  return v === "match" || TERM_SCHEMES.some((s) => s.id === v);
}

/** The scheme a terminal should use under the current app theme. */
export function resolveTermScheme(choice: TermSchemeChoice, theme: ThemeId): TermScheme {
  const id = choice === "match" ? theme : choice;
  return TERM_SCHEMES.find((s) => s.id === id) ?? TERM_SCHEMES[0];
}
