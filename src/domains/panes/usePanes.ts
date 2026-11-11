import { useCallback, useEffect, useMemo, useRef } from "react";
import { allTabs, isArranged, type PaneLayout, selectTab } from "./model";
import { type OwnedRun, openOwnedBeside } from "./owned";
import {
  type OpenRequest,
  ownedPanels,
  resolvePanel,
  useOpenRequests,
  usePanelKindsVersion,
} from "./registry";
import { storedLayout, usePaneLayoutStore } from "./store";
import type { PanelDescriptor } from "./types";
import { hideTabs, normalizeLayout, type TabCatalog } from "./validate";

/** What the pane area and its keys need: the fitted layout, its panels, and how to change it. */
export interface Panes {
  scope: string;
  layout: PaneLayout;
  /** Every panel in the layout, fixed and optional, by id (hidden ones too). */
  panels: Map<string, PanelDescriptor>;
  /** Each agent the detail hosts (workspace id) → its tab. */
  owners: Record<string, string>;
  /** Each agent's tab with the tabs it owns now (its subagents'), in start order. */
  runs: readonly OwnedRun[];
  /** Select a tab, first showing it (`PanelDescriptor.onReveal`) if it's hidden. */
  reveal: (tab: string) => void;
  /** Whether the user has arranged this workspace (Reset layout has something to undo). */
  arranged: boolean;
  /** Apply a layout operation to the current layout and remember the result. */
  apply: (op: (layout: PaneLayout) => PaneLayout) => void;
  /** Show a tab wherever it lives, and focus its pane. */
  select: (tab: string) => void;
  reset: () => void;
}

interface Catalog extends TabCatalog {
  owned: OwnedRun[];
  /** `owned`, read again: what an operation acts on, which can be newer than this render. */
  ownedNow: () => OwnedRun[];
}

/**
 * The pane layout for one workspace (`scope`), fitted to `fixed` — the panels the
 * detail always has, in order. `owners` maps each agent the detail hosts to its tab:
 * optional panels (`registerPanelKind`) belonging to one of them may join — placed
 * after that tab by themselves if their kind lists them (`owned`), or opened by
 * `openPanel` / `showPanel`.
 */
export function usePanes(
  scope: string,
  fixed: PanelDescriptor[],
  owners: Record<string, string>
): Panes {
  const saved = usePaneLayoutStore((s) => storedLayout(s, scope));
  const arranged = usePaneLayoutStore((s) => scope in s.saved);
  const save = usePaneLayoutStore((s) => s.save);
  const resetScope = usePaneLayoutStore((s) => s.reset);

  const fixedIds = fixed.map((p) => p.id).join("\n");
  const hiddenIds = fixed
    .filter((p) => p.hidden)
    .map((p) => p.id)
    .join("\n");
  const ownerKey = Object.entries(owners)
    .map(([ws, tab]) => `${ws}\t${tab}`)
    .join("\n");
  // Optional panels re-resolve when their kind's data changes (a subagent appears).
  const kindsVersion = usePanelKindsVersion();
  // biome-ignore lint/correctness/useExhaustiveDependencies: kindsVersion invalidates isOptional and owned
  const catalog = useMemo<Catalog>(() => {
    const ids = fixedIds.split("\n");
    const hosts = ownerKey ? ownerKey.split("\n").map((l) => l.split("\t")) : [];
    const hosted = new Set(hosts.map(([ws]) => ws));
    const known = new Set(ids);
    const ownedNow = () => hosts.map(([ws, tab]) => ({ owner: tab, tabs: ownedPanels(ws) }));
    return {
      fixed: ids,
      hidden: new Set(hiddenIds ? hiddenIds.split("\n") : []),
      isOptional: (tab) => {
        if (known.has(tab)) return false;
        const found = resolvePanel(tab);
        return found !== null && hosted.has(found.owner);
      },
      owned: ownedNow(),
      ownedNow,
    };
  }, [fixedIds, hiddenIds, ownerKey, kindsVersion]);
  // Operations act on the whole layout, hidden tabs and all, so they keep their
  // places; what's drawn (and counted) is the layout without them.
  const full = useMemo(() => normalizeLayout(saved, catalog), [saved, catalog]);
  const layout = useMemo(() => hideTabs(full, catalog.hidden ?? new Set()), [full, catalog]);

  const panels = new Map(fixed.map((p) => [p.id, p]));
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  for (const tab of allTabs(layout)) {
    if (panels.has(tab)) continue;
    const found = resolvePanel(tab);
    if (found) panels.set(tab, found.panel);
  }

  // Operations read the store, not this render's copy: two in one tick (a click
  // that focuses and selects) must compose.
  const latest = useRef({ scope, catalog });
  latest.current = { scope, catalog };
  const apply = useCallback(
    (op: (layout: PaneLayout) => PaneLayout) => {
      const { scope } = latest.current;
      // Owned tabs as they are now: an operation can follow the change that listed one.
      const catalog = { ...latest.current.catalog, owned: latest.current.catalog.ownedNow() };
      const current = normalizeLayout(storedLayout(usePaneLayoutStore.getState(), scope), catalog);
      const next = op(current);
      // Arranged: not the one row nothing has rearranged (fixed tabs, each agent's owned after it).
      const natural = allTabs(normalizeLayout(null, catalog));
      if (next !== current) save(scope, next, isArranged(next, natural));
    },
    [save]
  );
  const select = useCallback((tab: string) => apply((l) => selectTab(l, tab)), [apply]);
  const reveal = useCallback(
    (tab: string) => {
      const panel = panelsRef.current.get(tab);
      if (panel?.hidden) panel.onReveal?.();
      select(tab);
    },
    [select]
  );
  const reset = useCallback(() => resetScope(latest.current.scope), [resetScope]);

  useOpenRequestsFor(owners, catalog, apply);

  return {
    scope,
    layout,
    panels,
    owners,
    runs: catalog.owned,
    arranged,
    apply,
    select,
    reveal,
    reset,
  };
}

/**
 * What a request does to the layout, given its agent's tab. `l` already holds the
 * tabs the agent owns now (`apply` reads them), one reopened a moment ago included.
 */
function answer(l: PaneLayout, r: OpenRequest, owner: string, ownerTab: string): PaneLayout {
  if (!r.edge) return selectTab(l, r.id);
  return openOwnedBeside(l, r.id, { owner: ownerTab, tabs: ownedPanels(owner) }, r.edge);
}

/** Open or show the optional panels asked for that belong to an agent here. */
function useOpenRequestsFor(
  owners: Record<string, string>,
  catalog: TabCatalog,
  apply: Panes["apply"]
): void {
  const ref = useRef({ owners, catalog, apply });
  ref.current = { owners, catalog, apply };
  useEffect(() => {
    const drain = () => {
      const { owners, catalog, apply } = ref.current;
      const mine = useOpenRequests.getState().take((r) => catalog.isOptional(r.id));
      for (const r of mine) {
        const owner = resolvePanel(r.id)?.owner;
        const ownerTab = owner ? owners[owner] : undefined;
        if (owner && ownerTab) apply((l) => answer(l, r, owner, ownerTab));
      }
    };
    drain();
    return useOpenRequests.subscribe(drain);
  }, []);
}
