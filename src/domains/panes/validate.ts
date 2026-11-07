import {
  clampRatio,
  listGroups,
  mapGroups,
  type PaneLayout,
  type PaneNode,
  prune,
  singleGroup,
} from "./model.ts";

// A stored layout is untrusted (an older build wrote it, or a tab it names is gone),
// so it's parsed structurally, then fitted to the tabs the view has now: unknown and
// repeated tabs are dropped, missing ones are put back beside their neighbours.

/** Deeper than this is no layout trace could have written. */
const MAX_DEPTH = 6;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function parseNode(raw: unknown, depth: number, ids: Set<string>): PaneNode | null {
  if (!isObj(raw) || depth > MAX_DEPTH || typeof raw.id !== "string" || ids.has(raw.id)) {
    return null;
  }
  ids.add(raw.id);
  if (raw.kind === "group") {
    if (!Array.isArray(raw.tabs)) return null;
    const tabs = raw.tabs.filter((t): t is string => typeof t === "string");
    const active = typeof raw.active === "string" ? raw.active : (tabs[0] ?? "");
    return { kind: "group", id: raw.id, tabs, active };
  }
  if (raw.kind !== "split" || (raw.dir !== "row" && raw.dir !== "column")) return null;
  const first = parseNode(raw.first, depth + 1, ids);
  const second = parseNode(raw.second, depth + 1, ids);
  if (!first || !second) return null;
  const ratio = typeof raw.ratio === "number" ? clampRatio(raw.ratio) : 0.5;
  return { kind: "split", id: raw.id, dir: raw.dir, ratio, first, second };
}

/** A layout read back from storage, or null if it isn't one. */
export function parseLayout(raw: unknown): PaneLayout | null {
  if (!isObj(raw)) return null;
  const root = parseNode(raw.root, 0, new Set());
  if (!root) return null;
  const focused = typeof raw.focused === "string" ? raw.focused : "";
  return { root, focused };
}

export interface TabCatalog {
  /** Tabs that are always there, in their natural order. */
  fixed: string[];
  /** Tabs a layout may hold once opened (a subagent's view); others are dropped. */
  isOptional: (tab: string) => boolean;
  /** Fixed tabs out of the tab row for now: kept in place in the layout, not shown. */
  hidden?: ReadonlySet<string>;
}

/** Insert `tab` after `after` in whichever group holds it, or first in the first group. */
function insertTab(root: PaneNode, tab: string, after: string | null): PaneNode {
  const firstId = listGroups(root)[0].id;
  return mapGroups(root, (g) => {
    const at = after === null ? -1 : g.tabs.indexOf(after);
    if (at >= 0) return { ...g, tabs: [...g.tabs.slice(0, at + 1), tab, ...g.tabs.slice(at + 1)] };
    if (after === null && g.id === firstId) return { ...g, tabs: [tab, ...g.tabs] };
    return g;
  });
}

/**
 * Fit a layout (or none) to the tabs there are now. The result always holds every
 * fixed tab exactly once, no unknown tab, no empty group, a shown tab per group and
 * a focused group that exists.
 */
export function normalizeLayout(layout: PaneLayout | null, catalog: TabCatalog): PaneLayout {
  if (!layout) return singleGroup(catalog.fixed);
  const fixed = new Set(catalog.fixed);
  const seen = new Set<string>();
  const kept = mapGroups(layout.root, (g) => ({
    ...g,
    tabs: g.tabs.filter((t) => {
      if (seen.has(t) || !(fixed.has(t) || catalog.isOptional(t))) return false;
      seen.add(t);
      return true;
    }),
  }));
  let root = prune(kept);
  if (!root) return singleGroup(catalog.fixed);
  // Missing fixed tabs (a companion agent added since) go back after the tab that
  // precedes them in the natural order, so a new agent's tab lands beside the others.
  catalog.fixed.forEach((tab, i) => {
    if (seen.has(tab) || !root) return;
    root = insertTab(root, tab, i === 0 ? null : catalog.fixed[i - 1]);
    seen.add(tab);
  });
  const hidden = catalog.hidden;
  const shows = (t: string) => !hidden?.has(t);
  // A group shows a tab that's on show, where it has one.
  const fixedRoot = mapGroups(root, (g) => ({
    ...g,
    active:
      g.tabs.includes(g.active) && shows(g.active) ? g.active : (g.tabs.find(shows) ?? g.tabs[0]),
  }));
  const groups = listGroups(fixedRoot);
  const focused = groups.some((g) => g.id === layout.focused) ? layout.focused : groups[0].id;
  return { root: fixedRoot, focused };
}

/**
 * The layout as shown: `hidden` tabs taken out, and a pane left with nothing to
 * show gone with them. The stored layout keeps them (and their panes), so a tab
 * that comes back returns to where it was, beside the same tabs or in its own pane.
 */
export function hideTabs(layout: PaneLayout, hidden: ReadonlySet<string>): PaneLayout {
  if (hidden.size === 0) return layout;
  const shown = prune(
    mapGroups(layout.root, (g) => ({ ...g, tabs: g.tabs.filter((t) => !hidden.has(t)) }))
  );
  if (!shown) return singleGroup([]);
  const root = mapGroups(shown, (g) =>
    g.tabs.includes(g.active) ? g : { ...g, active: g.tabs[0] }
  );
  const groups = listGroups(root);
  const focused = groups.some((g) => g.id === layout.focused) ? layout.focused : groups[0].id;
  return { root, focused };
}
