import {
  allTabs,
  canSplit,
  type Edge,
  findGroup,
  groupOf,
  listGroups,
  mapGroups,
  moveTab,
  openBeside,
  type PaneLayout,
  selectTab,
  splitTab,
} from "./model.ts";

// Tabs an agent's tab owns: its subagents' views (`PanelKind.owned`). They place
// themselves in the agent's pane, right after the agent and its earlier ones, and
// read as one run with it (the strip's divider falls after the last). Placing one
// never changes what a pane shows or which pane has focus: only the user picks a
// tab. One the user moved (to another pane, or along the strip) stays where it is.

/** An agent's tab and the tabs it owns, in the order they started. */
export interface OwnedRun {
  owner: string;
  tabs: readonly string[];
}

/**
 * Put each of `run.tabs` that isn't anywhere in the layout into the owner's pane,
 * just after the rightmost of the owner and its earlier tabs that's there. What
 * each pane shows and the focused pane stay as they were.
 */
export function placeOwned(layout: PaneLayout, run: OwnedRun): PaneLayout {
  const present = new Set(allTabs(layout));
  if (!present.has(run.owner) || run.tabs.every((t) => present.has(t))) return layout;
  let root = layout.root;
  run.tabs.forEach((tab, i) => {
    if (present.has(tab)) return;
    present.add(tab);
    const home = listGroups(root).find((g) => g.tabs.includes(run.owner));
    if (!home) return;
    const earlier = new Set([run.owner, ...run.tabs.slice(0, i)]);
    let at = -1;
    home.tabs.forEach((t, j) => {
      if (earlier.has(t)) at = j;
    });
    const tabs = [...home.tabs.slice(0, at + 1), tab, ...home.tabs.slice(at + 1)];
    root = mapGroups(root, (g) => (g.id === home.id ? { ...g, tabs } : g));
  });
  return { ...layout, root };
}

/**
 * Open beside, for an owned tab: show it in a pane of its own next to its agent's.
 * One already in another pane than the agent's is only shown. Otherwise it splits
 * off to `edge` of the pane holding a sibling already opened beside (so a second one
 * doesn't halve the agent's pane again), or of the agent's own; with no room for
 * another pane it joins that pane, or stays where it is, shown.
 */
export function openOwnedBeside(
  layout: PaneLayout,
  tab: string,
  run: OwnedRun,
  edge: Edge
): PaneLayout {
  const ownerGroup = groupOf(layout, run.owner);
  if (!ownerGroup) return layout;
  const home = groupOf(layout, tab);
  if (home && home.id !== ownerGroup.id) return selectTab(layout, tab);
  const besides = run.tabs
    .filter((t) => t !== tab)
    .map((t) => groupOf(layout, t))
    .filter((g) => g !== undefined && g.id !== ownerGroup.id);
  const target = besides[besides.length - 1] ?? ownerGroup;
  if (!home) return openBeside(layout, tab, target.tabs[0], edge);
  if (canSplit(layout, tab, target.id)) return splitTab(layout, tab, target.id, edge);
  if (target.id !== home.id) return moveTab(layout, tab, target.id);
  return selectTab(layout, tab);
}

/**
 * `order` with each agent's owned tabs moved to just after the agent's, in start
 * order: one row in the tabs' own order (the narrow fallback's).
 */
export function inRunOrder(order: readonly string[], runs: readonly OwnedRun[]): string[] {
  const owned = new Set(runs.flatMap((r) => r.tabs));
  const present = new Set(order);
  return order
    .filter((t) => !owned.has(t))
    .flatMap((t) => {
      const run = runs.find((r) => r.owner === t);
      return run ? [t, ...run.tabs.filter((s) => present.has(s))] : [t];
    });
}

/** The run `tab` belongs to, as its agent or as one it owns. */
export function runOf(runs: readonly OwnedRun[], tab: string): OwnedRun | undefined {
  return runs.find((r) => r.owner === tab || r.tabs.includes(tab));
}

/**
 * The tab the next/previous-tab keys step from: the focused pane's, if it's an
 * agent's or one it owns; else the first pane's that is. Null: none on show.
 */
export function stepOrigin(layout: PaneLayout, runs: readonly OwnedRun[]): string | null {
  const focused = findGroup(layout, layout.focused);
  const groups = focused ? [focused, ...listGroups(layout.root)] : listGroups(layout.root);
  return groups.map((g) => g.active).find((t) => runOf(runs, t) !== undefined) ?? null;
}

/**
 * The tab after (`step` 1) or before (-1) `tab` among its agent and the tabs that
 * agent owns, in the order the strips show them (pane by pane), wrapping. Null when
 * `tab` isn't in a run, or its run has nothing else on show.
 */
export function stepRun(
  layout: PaneLayout,
  runs: readonly OwnedRun[],
  tab: string,
  step: number
): string | null {
  const run = runOf(runs, tab);
  if (!run) return null;
  const members = new Set([run.owner, ...run.tabs]);
  const order = allTabs(layout).filter((t) => members.has(t));
  const at = order.indexOf(tab);
  if (at < 0 || order.length < 2) return null;
  return order[(at + step + order.length * 2) % order.length];
}

/**
 * Where Esc goes from the focused pane's tab: up to its agent's tab, when the pane
 * shows one of that agent's subagents and holds the agent's tab too. Null otherwise
 * (an agent's own tab, a workspace tab, a subagent in a pane of its own), where Esc
 * keeps what it does: going back from the detail.
 */
export function upFrom(layout: PaneLayout, runs: readonly OwnedRun[]): string | null {
  const group = findGroup(layout, layout.focused);
  if (!group) return null;
  const run = runs.find((r) => r.tabs.includes(group.active));
  return run && group.tabs.includes(run.owner) ? run.owner : null;
}
