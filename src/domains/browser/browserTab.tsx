import { I } from "@/components/Icon";
import { comingFields } from "@/domains/panes/coming";
import type { PanelDescriptor } from "@/domains/panes/types";
import { BrowserPanel } from "./BrowserPanel";
import { BROWSER_TAB } from "./browserTabId";
import type { BrowserTabState } from "./store";

/**
 * The Browser tab as a panel, under the tabs rule (.claude/rules/tabs.md): there with
 * a page, hidden by its ×, back with the next page; a dot while an agent's page is
 * unseen. It opens empty, with an address bar.
 */
export function browserTab(ws: string, state: BrowserTabState, section?: string): PanelDescriptor {
  return {
    id: BROWSER_TAB,
    label: "Browser",
    icon: I.Globe,
    title: "Pages the agent opened, or you did",
    badge: state.unseen ? (
      <span className="pl-dot" role="img" aria-label="New page" />
    ) : state.count > 1 ? (
      <span className="count">{state.count}</span>
    ) : undefined,
    section,
    ...comingFields(state.coming, true),
    render: () => <BrowserPanel workspaceId={ws} />,
  };
}
