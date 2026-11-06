import type { ITerminalOptions } from "@xterm/xterm";
import { termFontFamily, termFontSize, termLineHeight } from "@/domains/agent/terminalPrefs";
import { activeTheme, isMotionReduced, useAppearance } from "./store";
import { resolveTermScheme } from "./terminalSchemes";

// Everything Appearance decides about an xterm, in one options object, so a
// new terminal and a live one being re-themed get exactly the same values.

/** The options terminalRegistry applies at creation and on every change. */
export function terminalAppearance(): ITerminalOptions {
  const s = useAppearance.getState();
  const { prefs } = s;
  return {
    theme: resolveTermScheme(prefs.termScheme, activeTheme(s)).theme,
    fontFamily: termFontFamily(),
    // The terminal's size is its own setting, so undo the interface zoom:
    // a 14px terminal stays 14px at 125%.
    fontSize: termFontSize() / (prefs.uiScale / 100),
    lineHeight: termLineHeight(),
    cursorStyle: prefs.cursorStyle,
    cursorBlink: prefs.cursorBlink && !isMotionReduced(s),
  };
}

/** The terminal background, for the pane around the canvas (--term-bg). */
export function terminalBackground(): string {
  const s = useAppearance.getState();
  return resolveTermScheme(s.prefs.termScheme, activeTheme(s)).theme.background ?? "";
}
