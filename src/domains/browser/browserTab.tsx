import { I } from "@/components/Icon";
import type { PanelDescriptor } from "@/domains/panes/types";
import { BrowserPanel } from "./BrowserPanel";
import { type BrowserTabState, useBrowserStore } from "./store";

export const BROWSER_TAB = "browser";

export const BROWSER_MENU_HINT =
  "Appears when the agent opens a page, such as its dev server. Pick it to open one yourself";

/**
 * The Browser tab as a panel. Like Plan it's only there with something to show (a
 * page), with a dot while an agent's page is unseen. The pane menu always lists it;
 * opened from there empty, it offers an address bar and closes again with its ×.
 */
export function browserTab(ws: string, state: BrowserTabState, section?: string): PanelDescriptor {
  const reveal = (on: boolean) => useBrowserStore.getState().reveal(ws, on);
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
    hidden: !state.visible,
    menuHint: BROWSER_MENU_HINT,
    onReveal: () => reveal(true),
    onClose: state.peeking ? () => reveal(false) : undefined,
    render: () => <BrowserPanel workspaceId={ws} />,
  };
}
