// Which tabs of a row keep their label, which are icons and which go to the "more"
// menu, for the room there is. Pure (`useTabFit` measures, this decides), so
// `node:test` covers it.
//
// Tabs fold one at a time, only as many as it takes, so a row a few pixels too
// wide loses one label, not all of them:
//   1. the early ones (a detail's subagent tabs), oldest first;
//   2. then the rest, from the end;
//   3. the active tab last.
// Past that, tabs leave for the "more" menu in the same order. The first tab and
// the active one always stay.

/** A tab's widths, or something fixed in the row (`of`: the tab it belongs to). */
export type FitItem =
  | { tab: string; full: number; icon: number; early: boolean }
  | { of: string | null; w: number };

export interface Fit {
  /** Tabs drawn as icons, their names in their tooltips. */
  icons: readonly string[];
  /** Tabs in the "more" menu, in strip order. */
  out: readonly string[];
}

export const ALL_LABELS: Fit = { icons: [], out: [] };

/** The width the row takes with `icons` folded and `out` gone. */
function need(
  items: readonly FitItem[],
  gap: number,
  icons: ReadonlySet<string>,
  out: ReadonlySet<string>
): number {
  let sum = 0;
  let n = 0;
  for (const item of items) {
    if ("tab" in item) {
      if (out.has(item.tab)) continue;
      sum += icons.has(item.tab) ? item.icon : item.full;
    } else {
      if (item.of !== null && out.has(item.of)) continue;
      sum += item.w;
    }
    n++;
  }
  return sum + gap * Math.max(0, n - 1);
}

interface Room {
  /** The row's width with no "more" trigger beside it. */
  avail: number;
  /** The "more" trigger's width, taken off once a tab is out. */
  more: number;
  /** The gap between the row's children. */
  gap: number;
}

/** The roomiest fit for `room`: as few icons, then as few tabs out, as it takes. */
export function solveFit(items: readonly FitItem[], active: string, room: Room): Fit {
  const tabs = items.flatMap((i) => ("tab" in i ? [i] : []));
  const ids = tabs.map((t) => t.tab);
  const inStrip = (picked: ReadonlySet<string>) => ids.filter((t) => picked.has(t));
  const early = tabs.filter((t) => t.early && t.tab !== active).map((t) => t.tab);
  const rest = tabs
    .filter((t) => !t.early && t.tab !== active)
    .map((t) => t.tab)
    .reverse();
  const none = new Set<string>();

  const icons = new Set<string>();
  const foldOrder = [...early, ...rest, ...(ids.includes(active) ? [active] : [])];
  // A tab no narrower as an icon (one with no icon: Settings' tabs) keeps its label;
  // folding it would save nothing, so the row goes straight to the "more" menu.
  const folds = new Set(tabs.filter((t) => t.icon < t.full).map((t) => t.tab));
  if (need(items, room.gap, icons, none) <= room.avail) return ALL_LABELS;
  for (const tab of foldOrder) {
    if (!folds.has(tab)) continue;
    icons.add(tab);
    if (need(items, room.gap, icons, none) <= room.avail) return { icons: inStrip(icons), out: [] };
  }

  // All icons and still too wide: tabs leave, in the same order. Never the first.
  const out = new Set<string>();
  const left = room.avail - room.more;
  for (const tab of [...early, ...rest]) {
    if (tab === ids[0]) continue;
    out.add(tab);
    if (need(items, room.gap, icons, out) <= left) break;
  }
  return { icons: inStrip(icons), out: inStrip(out) };
}

/** How folded a fit is: more out, then more icons, is tighter. */
export const tightness = (f: Fit) => f.out.length * 1000 + f.icons.length;

export const sameFit = (a: Fit, b: Fit) =>
  a.icons.join("\n") === b.icons.join("\n") && a.out.join("\n") === b.out.join("\n");

/**
 * The next fit, given the last. Unfolding takes `slack` px of spare room, so a width
 * that rounds either way can't flip a tab between its label and its icon.
 */
export function nextFit(
  items: readonly FitItem[],
  active: string,
  room: Room,
  was: Fit,
  slack: number
): Fit {
  const tight = solveFit(items, active, room);
  if (tightness(tight) >= tightness(was)) return tight;
  // The last fit names a tab that's gone: there's nothing to hold on to.
  const ids = new Set(items.flatMap((i) => ("tab" in i ? [i.tab] : [])));
  if (![...was.icons, ...was.out].every((t) => ids.has(t))) return tight;
  const loose = solveFit(items, active, { ...room, avail: room.avail - slack });
  return tightness(loose) < tightness(was) ? loose : was;
}
