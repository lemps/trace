// Keeping a clicked control under the pointer when an option moves the page
// (Interface size zooms the whole webview, Settings included). The maths is
// here, pure and tested; useScrollAnchor.ts does the DOM part.

/**
 * Where a control must sit after a zoom (its viewport y, in CSS px) to be
 * under the same point on screen: a CSS px is `scale`% of a screen point, so
 * `before × beforeScale` points must equal `after × afterScale`.
 */
export function targetTop(beforeTop: number, beforeScale: number, afterScale: number): number {
  return (beforeTop * beforeScale) / afterScale;
}

interface Anchor {
  /** The container's scrollTop now. */
  scrollTop: number;
  /** The control's viewport y now. */
  top: number;
  /** Where it should be. */
  target: number;
  /** The most the container can scroll (scrollHeight − clientHeight). */
  maxScrollTop: number;
}

/**
 * The scrollTop that brings the control from `top` to `target`: scrolling down
 * by d moves it up by d. Clamped to what the container can scroll, so near
 * either end it lands as close as it can.
 */
export function anchoredScrollTop({ scrollTop, top, target, maxScrollTop }: Anchor): number {
  const next = scrollTop + (top - target);
  return Math.min(Math.max(next, 0), Math.max(maxScrollTop, 0));
}

/**
 * Below this window width, in screen points, Appearance stacks each preview
 * above its settings. Measured in points (the CSS width × the zoom on screen)
 * so a zoom never flips the layout: only resizing the window does. At 1,080
 * points the side-by-side settings column still has ~390 CSS px at 150%.
 */
export const STACK_BELOW_PT = 1080;

/** Whether a window `cssWidth` CSS px wide at `scale`% is narrow enough to stack. */
export function isStacked(cssWidth: number, scale: number): boolean {
  return (cssWidth * scale) / 100 < STACK_BELOW_PT;
}
