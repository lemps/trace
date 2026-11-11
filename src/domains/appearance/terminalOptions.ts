// The terminal's own settings (Settings → Appearance → Terminal) as values:
// their ranges, presets, defaults and how a stored string is read back. Kept
// pure so they're tested on their own; agent/terminalPrefs.ts persists them.

/** Font size in px, as the terminal draws it (Interface size doesn't change it). */
export const TERM_SIZE = { min: 8, max: 32 } as const;
export const DEFAULT_TERM_FONT_SIZE = 14;

/** Line height presets: 1 is tightest (box drawing joins up), 1.5 the airiest. */
export const TERM_LINE_HEIGHTS = [1, 1.1, 1.2, 1.3, 1.5] as const;
export const DEFAULT_TERM_LINE_HEIGHT = 1;

/**
 * Lines kept above the screen. xterm's own default is 1,000 (checked in
 * @xterm/xterm 6.0.0's typings and bundle), which a long agent turn outruns;
 * trace keeps 10,000. Presets rather than a free number: each line costs memory
 * in every live terminal, so the choice is a few sane sizes, not any integer.
 */
export const TERM_SCROLLBACKS = [1_000, 10_000, 50_000, 100_000] as const;
export const DEFAULT_TERM_SCROLLBACK = 10_000;

/** A stored size: "" is the default (0); anything numeric is kept in range, to the half px. */
export function parseTermSize(raw: string): number {
  const n = Number.parseFloat(raw);
  if (!raw.trim() || !Number.isFinite(n)) return 0;
  const clamped = Math.min(TERM_SIZE.max, Math.max(TERM_SIZE.min, n));
  return Math.round(clamped * 2) / 2;
}

/**
 * A stored line height, as the nearest preset. Before the presets it was a free
 * number from 1 to 2, so an old 1.25 reads as 1.2 (the lower of a tie) and 1.8 as 1.5.
 */
export function parseTermLineHeight(raw: string): number {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return DEFAULT_TERM_LINE_HEIGHT;
  let best: number = TERM_LINE_HEIGHTS[0];
  for (const h of TERM_LINE_HEIGHTS) {
    if (Math.abs(h - n) < Math.abs(best - n) - 1e-9) best = h;
  }
  return best;
}

/** A stored scrollback: one of the presets, or the default. */
export function parseScrollback(raw: string): number {
  const n = Number(raw);
  return TERM_SCROLLBACKS.find((s) => s === n) ?? DEFAULT_TERM_SCROLLBACK;
}
