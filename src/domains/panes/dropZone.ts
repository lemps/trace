import type { Edge } from "./model.ts";

/** Where a tab dragged over a pane's content would land: into it, or a new pane at an edge. */
export type DropZone = Edge | "center";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How far in from an edge a drop still splits, as a share of the pane. */
const EDGE = 0.25;

/**
 * The zone under the pointer: the outer quarter on each side splits toward that
 * side (the nearer edge wins in a corner), the middle joins the pane's tabs.
 */
export function resolveDropZone(rect: Rect, x: number, y: number): DropZone {
  if (rect.width <= 0 || rect.height <= 0) return "center";
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  const near: [Edge, number][] = [
    ["left", fx],
    ["right", 1 - fx],
    ["top", fy],
    ["bottom", 1 - fy],
  ];
  const [edge, distance] = near.reduce((a, b) => (b[1] < a[1] ? b : a));
  return distance < EDGE ? edge : "center";
}

/** Insert before the tab under the pointer, or after it past its middle. */
export function insertionIndex(tabRects: { left: number; width: number }[], x: number): number {
  const at = tabRects.findIndex((r) => x < r.left + r.width / 2);
  return at < 0 ? tabRects.length : at;
}
