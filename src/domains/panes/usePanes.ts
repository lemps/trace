import { useCallback, useEffect, useMemo, useRef } from "react";
import { allTabs, isArranged, openBeside, type PaneLayout, selectTab } from "./model";
import { resolvePanel, useOpenRequests, usePanelKindsVersion } from "./registry";
import { useShownPanels } from "./shown";
import { storedLayout, usePaneLayoutStore } from "./store";
import type { PanelDescriptor } from "./types";
import { hideTabs, normalizeLayout, type TabCatalog } from "./validate";

/** What the pane area and its keys need: the fitted layout, its panels, and how to change it. */
export interface Panes {
  scope: string;
  layout: PaneLayout;
  /** Every panel in the layout, fixed and optional, by id (hidden ones too). */
  panels: Map<string, PanelDescriptor>;
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

/**
 * The pane layout for one workspace (`scope`), fitted to `fixed` — the panels the
 * detail always has, in order. `owners` maps each agent the detail hosts to its tab:
 * optional panels (`registerPanelKind`) belonging to one of them may join, opened by
 * `openPanel` beside that tab.
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
  const ownerKey = Object.keys(owners).join("\n");
  // Optional panels re-resolve when their kind's data changes (a subagent appears).
  const kindsVersion = usePanelKindsVersion();
  // biome-ignore lint/correctness/useExhaustiveDependencies: kindsVersion invalidates isOptional
  const catalog = useMemo<TabCatalog>(() => {
    const ids = fixedIds.split("\n");
    const hosted = new Set(ownerKey.split("\n"));
    const known = new Set(ids);
    return {
      fixed: ids,
      hidden: new Set(hiddenIds ? hiddenIds.split("\n") : []),
      isOptional: (tab) => {
        if (known.has(tab)) return false;
        const found = resolvePanel(tab);
        return found !== null && hosted.has(found.owner);
      },
    };
  }, [fixedIds, hiddenIds, ownerKey, kindsVersion]);
  // Operations act on the whole layout, hidden tabs and all, so they keep their
  // places; what's drawn (and counted, and published) is the layout without them.
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
      const { scope, catalog } = latest.current;
      const current = normalizeLayout(storedLayout(usePaneLayoutStore.getState(), scope), catalog);
      const next = op(current);
      if (next !== current) save(scope, next, isArranged(next, catalog.fixed));
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
  usePublishShown(scope, allTabs(layout).join("\n"));

  return { scope, layout, panels, arranged, apply, select, reveal, reset };
}

/** Open the optional panels `openPanel` asked for that belong to an agent here. */
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
        if (!ownerTab) continue;
        apply((l) => {
          // Beside the last panel of the same agent that's open already, so a
          // second subagent splits that pane rather than halving the chat again.
          const siblings = allTabs(l).filter((t) => t !== r.id && resolvePanel(t)?.owner === owner);
          return openBeside(l, r.id, siblings[siblings.length - 1] ?? ownerTab, r.edge);
        });
      }
    };
    drain();
    return useOpenRequests.subscribe(drain);
  }, []);
}

/** Say which tabs this detail's layout holds while it's on screen (`shown.ts`). */
function usePublishShown(scope: string, tabs: string): void {
  useEffect(() => {
    const { publish } = useShownPanels.getState();
    publish(scope, tabs.split("\n"));
    return () => publish(scope, null);
  }, [scope, tabs]);
}
