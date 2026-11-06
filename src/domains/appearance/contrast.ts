// How strongly xterm enforces text contrast against a terminal's background.
//
// TUIs pick colours for the background they assume, which is nearly always dark:
// Claude Code draws its dimmed file previews and diff context in pale grey that
// vanishes on white. On a light background xterm lifts any colour below WCAG AA
// (4.5:1), as VS Code's terminal does. Dark backgrounds keep xterm's default (1,
// off), so the dark schemes look exactly as they did.

const LIGHT_MIN_CONTRAST = 4.5;
const OFF = 1;

/** Relative luminance (0 black – 1 white) of a `#rrggbb` colour, or null. */
export function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = m.slice(1).map((part) => {
    const c = Number.parseInt(part, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** xterm's `minimumContrastRatio` for a terminal with this background. */
export function minimumContrastFor(background: string | undefined): number {
  const l = background ? luminance(background) : null;
  return l !== null && l > 0.5 ? LIGHT_MIN_CONTRAST : OFF;
}
