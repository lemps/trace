import { useCallback, useEffect, useMemo, useRef } from "react";
import { allTabs, openBeside, type PaneLayout, selectTab } from "./model";
import { resolvePanel, useOpenRequests } from "./registry";
import { usePaneLayoutStore, useSavedLayout } from "./store";
import type { PanelDescriptor } from "./types";
import { normalizeLayout, type TabCatalog } from "./validate";

/** What the pane area and its keys need: the fitted layout, its panels, and how to change it. */
export interface Panes {
  scope: string;
  layout: PaneLayout;
  /** Every panel in the layout, fixed and optional, by id. */
  panels: Map<string, PanelDescriptor>;
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
  const saved = useSavedLayout(scope);
  const save = usePaneLayoutStore((s) => s.save);
  const resetScope = usePaneLayoutStore((s) => s.reset);

  const fixedIds = fixed.map((p) => p.id).join("\n");
  const ownerKey = Object.keys(owners).join("\n");
  const catalog = useMemo<TabCatalog>(() => {
    const ids = fixedIds.split("\n");
    const hosted = new Set(ownerKey.split("\n"));
    const known = new Set(ids);
    return {
      fixed: ids,
      isOptional: (tab) => {
        if (known.has(tab)) return false;
        const found = resolvePanel(tab);
        return found !== null && hosted.has(found.owner);
      },
    };
  }, [fixedIds, ownerKey]);
  const layout = useMemo(() => normalizeLayout(saved, catalog), [saved, catalog]);

  const panels = new Map(fixed.map((p) => [p.id, p]));
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
      const stored = usePaneLayoutStore.getState().saved[scope]?.layout ?? null;
      const current = normalizeLayout(stored, catalog);
      const next = op(current);
      if (next !== current) save(scope, next);
    },
    [save]
  );
  const select = useCallback((tab: string) => apply((l) => selectTab(l, tab)), [apply]);
  const reset = useCallback(() => resetScope(latest.current.scope), [resetScope]);

  useOpenRequestsFor(owners, catalog, apply);

  return { scope, layout, panels, arranged: saved !== null, apply, select, reset };
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
        const beside = owner ? owners[owner] : undefined;
        if (beside) apply((l) => openBeside(l, r.id, beside, r.edge));
      }
    };
    drain();
    return useOpenRequests.subscribe(drain);
  }, []);
}
