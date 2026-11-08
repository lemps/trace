// Which number picks a tab (⌘1–9, `useDetailKeys`): its place among the detail's
// own panels that are showing, wherever they sit in the panes. Optional panels (a
// subagent's view) and hidden ones (a tab with nothing in it) have none.

export const NUMBERED_TABS = 9;

interface Numberable {
  id: string;
  hidden?: boolean;
  optional?: boolean;
}

/** Each numbered tab's number (1–9), by id. */
export function tabNumbers(panels: Iterable<Numberable>): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const p of panels) {
    if (p.hidden || p.optional) continue;
    if (numbers.size === NUMBERED_TABS) break;
    numbers.set(p.id, numbers.size + 1);
  }
  return numbers;
}
