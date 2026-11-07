import type { MenuItem, MenuSection } from "@/components/PopMenu";
import { useHint } from "@/platform/shortcuts";
import {
  canSplit,
  closeGroup,
  groupOf,
  listGroups,
  moveToNextGroup,
  removeTab,
  splitTab,
} from "./model";
import type { Panes } from "./usePanes";

export interface PaneHints {
  right: string;
  down: string;
  move: string;
}

/** The pane shortcuts' current bindings, for menu hints. */
export function usePaneHints(): PaneHints {
  return {
    right: useHint("paneSplitRight"),
    down: useHint("paneSplitDown"),
    move: useHint("paneMoveTab"),
  };
}

/**
 * What can be done with `tab` and the pane it's in — the tab's right-click menu and
 * the strip's ⋯. Split off, send along, close the pane (its tabs join the next one),
 * or put everything back in one row. In the narrow fallback only the reset applies.
 */
export function paneMenu(
  panes: Panes,
  tab: string,
  hints: PaneHints,
  narrow: boolean,
  after: () => void
): MenuSection[] {
  const { layout, apply } = panes;
  const home = groupOf(layout, tab);
  const panel = panes.panels.get(tab);
  const label = panel?.label ?? "Tab";
  if (!home) return [];
  const groups = listGroups(layout.root).length;
  const splittable = !narrow && canSplit(layout, tab, home.id);
  const why = narrow
    ? "Widen the window to arrange panes"
    : home.tabs.length < 2
      ? `${label} is this pane's only tab`
      : "There are as many panes as fit";
  const run = (op: Parameters<Panes["apply"]>[0]) => () => {
    apply(op);
    after();
  };
  const items: MenuItem[] = [
    {
      label: "Split right",
      hint: hints.right,
      disabled: !splittable,
      title: splittable ? undefined : why,
      onSelect: run((l) => splitTab(l, tab, home.id, "right")),
    },
    {
      label: "Split down",
      hint: hints.down,
      disabled: !splittable,
      title: splittable ? undefined : why,
      onSelect: run((l) => splitTab(l, tab, home.id, "bottom")),
    },
    {
      label: "Move to next pane",
      hint: hints.move,
      disabled: narrow || (groups === 1 && !splittable),
      onSelect: run((l) => moveToNextGroup(l, tab)),
    },
  ];
  if (panel?.optional) {
    items.push({ label: `Close ${label}`, onSelect: run((l) => removeTab(l, tab)) });
  }
  if (groups > 1 && !narrow) {
    items.push({ label: "Close pane", onSelect: run((l) => closeGroup(l, home.id)) });
  }
  return [{ title: label, items }, { items: layoutItems(panes, after) }];
}

/** Reset layout: in every pane menu, and in the detail header's ⋯. */
export function layoutItems(panes: Panes, after?: () => void): MenuItem[] {
  return [
    {
      label: "Reset layout",
      disabled: !panes.arranged,
      title: "Put every tab back in one row",
      onSelect: () => {
        panes.reset();
        after?.();
      },
    },
  ];
}
