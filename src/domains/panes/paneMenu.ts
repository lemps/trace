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
import { tabMark } from "./tabMark";
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
  return [
    { title: label, items },
    { title: "Tabs", items: comingTabs(panes, after) },
    { items: layoutItems(panes, after) },
  ];
}

/**
 * Tabs that come and go (.claude/rules/tabs.md), always listed so they can be found:
 * a filled accent mark when one has content, a hollow one when it's empty. A hidden
 * one shows again when picked; an empty one only if it can open empty (a shell, a
 * blank page), since Plan or a PR come from the agent. What each is for: Settings → Tabs.
 */
export function comingTabs(panes: Panes, after?: () => void): MenuItem[] {
  return [...panes.panels.values()]
    .filter((p) => p.comes)
    .map((p) => {
      const filled = p.filled === true;
      const shown = !p.hidden;
      return {
        id: `tab:${p.id}`,
        label: tabMark(p.label, filled),
        disabled: !shown && !filled && !p.opensEmpty,
        title: shown
          ? `Show ${p.label}`
          : filled || p.opensEmpty
            ? `Open ${p.label}`
            : "Nothing here yet",
        onSelect: () => {
          if (shown) panes.select(p.id);
          else panes.reveal(p.id);
          after?.();
        },
      };
    });
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
