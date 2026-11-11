import { UI_SCALES } from "./prefs.ts";

// The zoom shortcuts (Zoom in, Zoom out, Actual size): they walk the same
// Interface size steps the setting offers and write the same pref, so the
// control and the keys can never disagree.

export type ZoomStep = "in" | "out" | "reset";

/**
 * The Interface size one step from `current`: the next listed step up or down
 * (staying put at either end), or 100% for "reset". A value that isn't a step
 * (it can't be, after prefs validation, but stored data is untrusted) moves to
 * the nearest step in that direction.
 */
export function stepScale(current: number, step: ZoomStep): number {
  if (step === "reset") return 100;
  if (step === "in") return UI_SCALES.find((s) => s > current) ?? UI_SCALES[UI_SCALES.length - 1];
  return [...UI_SCALES].reverse().find((s) => s < current) ?? UI_SCALES[0];
}
