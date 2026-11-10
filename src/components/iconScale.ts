// The icon scale (trace-ui §4): icon sizes follow the control heights, and the
// stroke is compensated so a glyph draws the same line weight at every size.

/**
 * The icon sizes: `xs` controls and in-row pills, `.btn` and `sm` controls, the rail/nav and
 * small in-panel empties, and the glyph over a full-page or full-pane `.empty-state`.
 */
export const ICON_SIZE = { xs: 12, sm: 14, md: 16, empty: 28 } as const;

export type IconSize = (typeof ICON_SIZE)[keyof typeof ICON_SIZE];

/** The line weight every glyph renders at, in screen pixels. */
export const ICON_LINE_PX = 1.1;

/** The default icon size when a caller gives none. */
export const DEFAULT_ICON_SIZE: number = ICON_SIZE.md;

/**
 * The `strokeWidth` (in the 24-unit frame) that renders `ICON_LINE_PX` at `size` px.
 * A fixed stroke drew 0.8px at 12 and 1.07px at 16; this keeps every size at ~1.1px.
 */
export function strokeFor(size: number): number {
  const px = size > 0 ? size : DEFAULT_ICON_SIZE;
  return Math.round(((ICON_LINE_PX * 24) / px) * 100) / 100;
}
