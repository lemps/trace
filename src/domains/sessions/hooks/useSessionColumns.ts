import { type RefObject, useEffect, useLayoutEffect } from "react";

// The Sessions list's columns, sized from what's in them. Every row is its own
// grid (rows sit in sections), so content-sized tracks wouldn't line up from row
// to row; instead the widest name, PR, diff and age on the page are measured and
// set as CSS variables on the page body (`session-list.css`). The name column
// then grows to its widest title before repo · branch gets what's left, and the
// PR, diff and age columns are as wide as their content (none, when it's empty).

/** Width of an element's content, whatever width its cell has been given. */
function contentWidth(cell: Element | null): number {
  if (!cell?.firstChild) return 0;
  const range = document.createRange();
  range.selectNodeContents(cell);
  return range.getBoundingClientRect().width;
}

/** The name cell's width with its title in full (it ellipsizes when squeezed). */
function nameWidth(cell: HTMLElement | null): number {
  if (!cell) return 0;
  const gap = Number.parseFloat(getComputedStyle(cell).columnGap) || 0;
  let width = 0;
  for (const child of cell.children) {
    if (!(child instanceof HTMLElement)) continue;
    width += child.classList.contains("sr-title") ? child.scrollWidth : child.offsetWidth;
  }
  return width + gap * Math.max(0, cell.children.length - 1);
}

const COLUMNS = [
  ["--sr-name-w", (row: HTMLElement) => nameWidth(row.querySelector<HTMLElement>(".sr-name"))],
  ["--sr-pr-w", (row: HTMLElement) => contentWidth(row.querySelector(".sr-pr"))],
  ["--sr-diff-w", (row: HTMLElement) => contentWidth(row.querySelector(".sr-diff"))],
  ["--sr-time-w", (row: HTMLElement) => contentWidth(row.querySelector(".sr-time"))],
] as const;

function measure(el: HTMLElement): void {
  const rows = [...el.querySelectorAll<HTMLElement>(".session-row")];
  for (const [name, width] of COLUMNS) {
    const widest = rows.reduce((w, row) => Math.max(w, width(row)), 0);
    const value = `${Math.ceil(widest)}px`;
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
  }
}

/** Measure the rows under `body` after every render (titles, PRs and diffs load late). */
export function useSessionColumns(body: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (body.current) measure(body.current);
  });
  // And once the fonts are in: text measured in a fallback font is the wrong width.
  useEffect(() => {
    const again = () => {
      if (body.current) measure(body.current);
    };
    document.fonts.addEventListener("loadingdone", again);
    return () => document.fonts.removeEventListener("loadingdone", again);
  }, [body]);
}
