import { findPaths } from "./paths.ts";
import type { LinkTarget } from "./store.ts";

// Links on a terminal row, in cells. A row's text isn't its cells: a wide
// character (CJK, most emoji) is one string index over two cells, and a long path
// soft-wraps onto the next row. So matching runs on the whole logical line (the
// row plus the rows it wraps across) with a map from each character back to the
// cell it starts in. Pure over the slice of xterm's buffer API it reads, so it's
// tested on its own.

/** The part of an xterm buffer cell this reads (`IBufferCell`). */
export interface CellLike {
  getChars(): string;
  getWidth(): number;
}

/** The part of an xterm buffer line this reads (`IBufferLine`). */
export interface CellLineLike {
  isWrapped: boolean;
  length: number;
  getCell(x: number): CellLike | undefined;
}

/** The part of an xterm buffer this reads (`IBuffer`). */
export interface CellBufferLike {
  getLine(y: number): CellLineLike | undefined;
}

/** A cell (0-based) and how many columns its character covers. */
export interface Cell {
  x: number;
  y: number;
  width: number;
}

/** The logical line through buffer row `y`: its text, and the cell each character starts in. */
export function logicalLine(buffer: CellBufferLike, y: number): { text: string; cells: Cell[] } {
  let start = y;
  while (start > 0 && buffer.getLine(start)?.isWrapped) start--;
  let text = "";
  const cells: Cell[] = [];
  for (let row = start; ; row++) {
    const line = buffer.getLine(row);
    if (!line || (row > start && !line.isWrapped)) break;
    for (let x = 0; x < line.length; x++) {
      const cell = line.getCell(x);
      const width = cell?.getWidth() ?? 1;
      if (width === 0) continue; // the right half of a wide character
      const chars = cell?.getChars() || " ";
      for (let i = 0; i < chars.length; i++) cells.push({ x, y: row, width });
      text += chars;
    }
  }
  const trimmed = text.trimEnd();
  return { text: trimmed, cells: cells.slice(0, trimmed.length) };
}

// Plain-text URLs; trailing punctuation is the sentence's, not the URL's.
const URL_RE = /https?:\/\/[^\s<>"'`]+/g;

/** A link found on a logical line, as a cell span (end inclusive). */
export interface CellLink {
  target: LinkTarget;
  text: string;
  start: Cell;
  end: Cell;
}

function urls(text: string): { start: number; end: number; url: string }[] {
  return [...text.matchAll(URL_RE)].map((m) => {
    const url = m[0].replace(/[.,;:!?)\]}]+$/, "");
    const start = m.index ?? 0;
    return { start, end: start + url.length, url };
  });
}

/**
 * Links on the logical line through row `y`. File paths always; URLs only when
 * asked (the web-links addon already makes them clickable, so the click provider
 * leaves them out).
 */
export function linksOnLine(buffer: CellBufferLike, y: number, withUrls: boolean): CellLink[] {
  const { text, cells } = logicalLine(buffer, y);
  const span = (s: number, e: number) => ({ start: cells[s], end: cells[e - 1] });
  const out: CellLink[] = [];
  const urlSpans = urls(text);
  if (withUrls) {
    for (const u of urlSpans) {
      out.push({ target: { kind: "url", url: u.url }, text: u.url, ...span(u.start, u.end) });
    }
  }
  for (const m of findPaths(text)) {
    // A path inside a URL is part of the URL.
    if (urlSpans.some((u) => m.start >= u.start && m.start < u.end)) continue;
    const target: LinkTarget = { kind: "file", path: m.path, line: m.line, col: m.col };
    out.push({ target, text: m.path, ...span(m.start, m.end) });
  }
  return out.filter((l) => l.start && l.end);
}

const before = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.y < b.y || (a.y === b.y && a.x <= b.x);

/** The link covering cell (x, y), if any. */
export function linkAt(buffer: CellBufferLike, x: number, y: number): LinkTarget | null {
  const hit = linksOnLine(buffer, y, true).find(
    (l) =>
      before(l.start, { x, y }) && before({ x, y }, { x: l.end.x + l.end.width - 1, y: l.end.y })
  );
  return hit?.target ?? null;
}
