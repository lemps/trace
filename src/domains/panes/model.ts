// The detail view's pane layout as plain data: a binary tree whose leaves are tab
// groups (a strip of tabs, one shown) and whose inner nodes split their space in two,
// side by side ("row") or stacked ("column"). Every operation is a pure function from
// one layout to the next, so the view, the keyboard and persistence share one model
// and the tests can drive it without a DOM. A tab lives in exactly one group.

export type SplitDir = "row" | "column";
export type Edge = "left" | "right" | "top" | "bottom";

export interface PaneGroup {
  kind: "group";
  id: string;
  tabs: string[];
  /** The tab the group shows; one of `tabs`. */
  active: string;
}

export interface PaneSplit {
  kind: "split";
  id: string;
  dir: SplitDir;
  /** The first child's share of the space, 0–1. */
  ratio: number;
  first: PaneNode;
  second: PaneNode;
}

export type PaneNode = PaneGroup | PaneSplit;

export interface PaneLayout {
  root: PaneNode;
  /** The group keys and new splits act on. */
  focused: string;
}

/** More groups than this stop being useful in a detail view's width. */
export const MAX_GROUPS = 4;
export const MIN_RATIO = 0.1;
export const MAX_RATIO = 0.9;

export const clampRatio = (r: number) =>
  Number.isFinite(r) ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, r)) : 0.5;

/** Everything in one group, as the detail view has always shown it. */
export function singleGroup(tabs: string[]): PaneLayout {
  return { root: { kind: "group", id: "g1", tabs, active: tabs[0] ?? "" }, focused: "g1" };
}

/** Groups in reading order: first before second, at every level. */
export function listGroups(node: PaneNode): PaneGroup[] {
  return node.kind === "group" ? [node] : [...listGroups(node.first), ...listGroups(node.second)];
}

export function findGroup(layout: PaneLayout, id: string): PaneGroup | undefined {
  return listGroups(layout.root).find((g) => g.id === id);
}

export function groupOf(layout: PaneLayout, tab: string): PaneGroup | undefined {
  return listGroups(layout.root).find((g) => g.tabs.includes(tab));
}

export function focusedGroup(layout: PaneLayout): PaneGroup {
  return findGroup(layout, layout.focused) ?? listGroups(layout.root)[0];
}

/** Every tab, in group order. */
export function allTabs(layout: PaneLayout): string[] {
  return listGroups(layout.root).flatMap((g) => g.tabs);
}

/** The tab each group shows. */
export function visibleTabs(layout: PaneLayout): string[] {
  return listGroups(layout.root).map((g) => g.active);
}

function allIds(node: PaneNode): string[] {
  return node.kind === "group"
    ? [node.id]
    : [node.id, ...allIds(node.first), ...allIds(node.second)];
}

/** An id no node in the layout uses yet (`g3`, `s2`). */
export function freshId(root: PaneNode, prefix: "g" | "s"): string {
  const used = new Set(allIds(root));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function mapGroups(node: PaneNode, fn: (g: PaneGroup) => PaneNode): PaneNode {
  if (node.kind === "group") return fn(node);
  return { ...node, first: mapGroups(node.first, fn), second: mapGroups(node.second, fn) };
}

/** Drop empty groups; a split left with one child becomes that child. */
export function prune(node: PaneNode): PaneNode | null {
  if (node.kind === "group") return node.tabs.length > 0 ? node : null;
  const first = prune(node.first);
  const second = prune(node.second);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function withoutTab(g: PaneGroup, tab: string): PaneGroup {
  const at = g.tabs.indexOf(tab);
  if (at < 0) return g;
  const tabs = g.tabs.filter((t) => t !== tab);
  // Closing the shown tab shows its neighbour, as a tab strip does.
  const active = g.active === tab ? (tabs[Math.min(at, tabs.length - 1)] ?? "") : g.active;
  return { ...g, tabs, active };
}

/** The layout with `focused` pointing at a group that still exists. */
function settle(root: PaneNode, focused: string): PaneLayout {
  const groups = listGroups(root);
  return { root, focused: groups.some((g) => g.id === focused) ? focused : groups[0].id };
}

/** Show `tab` in its group and focus that group. */
export function selectTab(layout: PaneLayout, tab: string): PaneLayout {
  const home = groupOf(layout, tab);
  if (!home || (home.active === tab && layout.focused === home.id)) return layout;
  const root = mapGroups(layout.root, (g) => (g.id === home.id ? { ...g, active: tab } : g));
  return { root, focused: home.id };
}

export function focusGroupId(layout: PaneLayout, id: string): PaneLayout {
  return layout.focused === id || !findGroup(layout, id) ? layout : { ...layout, focused: id };
}

/** Focus the next (`+1`) or previous (`-1`) group, wrapping. */
export function cycleFocus(layout: PaneLayout, delta: number): PaneLayout {
  const groups = listGroups(layout.root);
  const at = groups.findIndex((g) => g.id === layout.focused);
  const next = groups[(at + delta + groups.length * 2) % groups.length];
  return focusGroupId(layout, next.id);
}

/**
 * Move `tab` into group `to` at `index` (the end if omitted), shown and focused.
 * Within one group this reorders. A group the move empties closes.
 */
export function moveTab(layout: PaneLayout, tab: string, to: string, index?: number): PaneLayout {
  const from = groupOf(layout, tab);
  const target = findGroup(layout, to);
  if (!from || !target) return layout;
  const root = mapGroups(layout.root, (g) => {
    const rest = g.id === from.id ? withoutTab(g, tab) : g;
    if (g.id !== to) return rest;
    // An index counted in the old order shifts left when the tab came from before it.
    const old = g.tabs.indexOf(tab);
    let at = index ?? rest.tabs.length;
    if (index !== undefined && old >= 0 && old < index) at -= 1;
    const tabs = [...rest.tabs];
    tabs.splice(Math.max(0, Math.min(at, tabs.length)), 0, tab);
    return { ...rest, tabs, active: tab };
  });
  const pruned = prune(root);
  return pruned ? settle(pruned, to) : layout;
}

/** Whether `tab` can go into a new pane beside `target`: it isn't the only tab of the group it would leave, and there's room for one more group. */
export function canSplit(layout: PaneLayout, tab: string, target: string): boolean {
  const from = groupOf(layout, tab);
  if (!from || !findGroup(layout, target)) return false;
  if (from.id === target && from.tabs.length < 2) return false;
  // Leaving a group it empties frees that group's slot.
  const freed = from.tabs.length === 1 ? 1 : 0;
  return listGroups(layout.root).length - freed < MAX_GROUPS;
}

/** Take `tab` out of its group into a new one at `edge` of group `target`. */
export function splitTab(layout: PaneLayout, tab: string, target: string, edge: Edge): PaneLayout {
  if (!canSplit(layout, tab, target)) return layout;
  const from = groupOf(layout, tab);
  if (!from) return layout;
  const groupId = freshId(layout.root, "g");
  const splitId = freshId(layout.root, "s");
  const fresh: PaneGroup = { kind: "group", id: groupId, tabs: [tab], active: tab };
  const dir: SplitDir = edge === "left" || edge === "right" ? "row" : "column";
  const before = edge === "left" || edge === "top";
  const removed = prune(mapGroups(layout.root, (g) => (g.id === from.id ? withoutTab(g, tab) : g)));
  if (!removed) return layout;
  const root = mapGroups(removed, (g) =>
    g.id === target
      ? {
          kind: "split",
          id: splitId,
          dir,
          ratio: 0.5,
          first: before ? fresh : g,
          second: before ? g : fresh,
        }
      : g
  );
  return { root, focused: groupId };
}

function parentOf(node: PaneNode, id: string): PaneSplit | null {
  if (node.kind === "group") return null;
  if (node.first.id === id || node.second.id === id) return node;
  return parentOf(node.first, id) ?? parentOf(node.second, id);
}

/**
 * Close group `id`: its tabs join the pane it shared a split with (the nearest
 * group on that side), which keeps showing what it showed.
 */
export function closeGroup(layout: PaneLayout, id: string): PaneLayout {
  const closing = findGroup(layout, id);
  const parent = parentOf(layout.root, id);
  if (!closing || !parent) return layout;
  const sibling = parent.first.id === id ? parent.second : parent.first;
  const siblingGroups = listGroups(sibling);
  const into = parent.first.id === id ? siblingGroups[0] : siblingGroups[siblingGroups.length - 1];
  const root = prune(
    mapGroups(layout.root, (g) => {
      if (g.id === id) return { ...g, tabs: [] };
      if (g.id === into.id) return { ...g, tabs: [...g.tabs, ...closing.tabs] };
      return g;
    })
  );
  return root ? settle(root, into.id) : layout;
}

/**
 * Send `tab` to the next group (wrapping). With one group, it opens a pane to the
 * right — the keyboard's way to start a split.
 */
export function moveToNextGroup(layout: PaneLayout, tab: string): PaneLayout {
  const from = groupOf(layout, tab);
  if (!from) return layout;
  const groups = listGroups(layout.root);
  if (groups.length === 1) return splitTab(layout, tab, from.id, "right");
  const at = groups.findIndex((g) => g.id === from.id);
  return moveTab(layout, tab, groups[(at + 1) % groups.length].id);
}

function mapSplit(node: PaneNode, id: string, fn: (s: PaneSplit) => PaneSplit): PaneNode {
  if (node.kind === "group") return node;
  if (node.id === id) return fn(node);
  return { ...node, first: mapSplit(node.first, id, fn), second: mapSplit(node.second, id, fn) };
}

export function setRatio(layout: PaneLayout, splitId: string, ratio: number): PaneLayout {
  const root = mapSplit(layout.root, splitId, (s) => ({ ...s, ratio: clampRatio(ratio) }));
  return { ...layout, root };
}

/** The least size a node can be drawn at, given each group's minimum. */
export function minSize(node: PaneNode, minW: number, minH: number): { w: number; h: number } {
  if (node.kind === "group") return { w: minW, h: minH };
  const a = minSize(node.first, minW, minH);
  const b = minSize(node.second, minW, minH);
  return node.dir === "row"
    ? { w: a.w + b.w, h: Math.max(a.h, b.h) }
    : { w: Math.max(a.w, b.w), h: a.h + b.h };
}

/** Take `tab` out of the layout (an optional panel being closed). A group it empties closes. */
export function removeTab(layout: PaneLayout, tab: string): PaneLayout {
  const from = groupOf(layout, tab);
  if (!from) return layout;
  const root = prune(mapGroups(layout.root, (g) => (g.id === from.id ? withoutTab(g, tab) : g)));
  return root ? settle(root, layout.focused) : layout;
}

/**
 * Open `tab` (not yet in the layout) in a new pane at `edge` of the group holding
 * `beside`; at the group cap it joins that group instead. One already open is shown.
 */
export function openBeside(
  layout: PaneLayout,
  tab: string,
  beside: string,
  edge: Edge
): PaneLayout {
  if (groupOf(layout, tab)) return selectTab(layout, tab);
  const home = groupOf(layout, beside) ?? focusedGroup(layout);
  // Join the owner's group (keeping what it shows), then split off from there.
  const root = mapGroups(layout.root, (g) =>
    g.id === home.id ? { ...g, tabs: [...g.tabs, tab] } : g
  );
  const joined = { root, focused: home.id };
  return canSplit(joined, tab, home.id)
    ? splitTab(joined, tab, home.id, edge)
    : selectTab(joined, tab);
}

/**
 * Whether a layout is the user's arrangement rather than the default one row: split,
 * holding an optional panel, or with its tabs out of their natural order.
 */
export function isArranged(layout: PaneLayout, natural: string[]): boolean {
  if (layout.root.kind === "split") return true;
  const tabs = layout.root.tabs;
  return tabs.length !== natural.length || tabs.some((t, i) => t !== natural[i]);
}
