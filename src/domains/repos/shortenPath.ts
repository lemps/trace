// Paths shortened in the middle: the start says where it is (`/Users/ron/…`) and
// the last folder says which one, so both stay and the middle gives way. An end
// ellipsis would cut the one part that tells two repos apart.

const ELLIPSIS = "…";
const SEP = /[\\/]/;

/** The index of the last separator before the path's final component, or -1. */
function lastSeparator(path: string): number {
  for (let i = path.length - 1; i >= 0; i--) {
    if (SEP.test(path[i] ?? "")) return i;
  }
  return -1;
}

/**
 * `path` in at most `max` characters. Keeps the start and the last folder; the
 * start is cut back to a whole folder where one fits. A last folder too long to
 * keep whole is cut from its start instead.
 */
export function shortenPath(path: string, max: number): string {
  if (path.length <= max) return path;
  if (max <= 1) return ELLIPSIS.slice(0, Math.max(0, max));
  // A trailing separator isn't a folder: keep it out of the tail.
  const trimmed = path.replace(/[\\/]+$/, "");
  if (trimmed.length <= max) return trimmed;
  const sep = lastSeparator(trimmed);
  const tail = sep >= 0 ? trimmed.slice(sep) : trimmed;
  // Room for the tail, the ellipsis and at least one character of the start.
  if (tail.length + 2 > max) return ELLIPSIS + trimmed.slice(trimmed.length - (max - 1));
  const head = trimmed.slice(0, max - tail.length - 1);
  const headSep = lastSeparator(head);
  // Snap to a whole folder (`/Users/ron/…`), unless that leaves only the root.
  const snapped = headSep > 0 ? head.slice(0, headSep + 1) : head;
  return snapped + ELLIPSIS + tail;
}
