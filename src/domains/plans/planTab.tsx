import { I } from "@/components/Icon";
import type { PanelDescriptor } from "@/domains/panes/types";
import { PlanPanel } from "./PlanPanel";
import { type PlanTabState, usePlanStore } from "./store";

/**
 * The Plan tab's id. It was the HTML tab's, and stays "html" so layouts saved
 * with that tab in them put Plan in its place.
 */
export const PLAN_TAB = "html";

export const PLAN_MENU_HINT = "Appears when the agent writes a plan in plan mode, or publishes one";

interface PlanTabArgs {
  workspaceId: string;
  /** The agent's own tab (for "Send to agent as context"). */
  agentTab: string;
  state: PlanTabState;
  /** Whose plans these are, for the tooltip. */
  agentLabel?: string;
  section?: string;
}

/**
 * The Plan tab as a panel. Like a subagent's tab it's only there with something
 * to show (a document or a task list), and it carries a dot while a new document
 * is unseen. The pane menu always lists it; opened from there empty, it explains
 * itself and closes again with its ×.
 */
export function planTab(a: PlanTabArgs): PanelDescriptor {
  const reveal = (on: boolean) => usePlanStore.getState().reveal(a.workspaceId, on);
  return {
    id: PLAN_TAB,
    label: "Plan",
    icon: I.Plan,
    title: a.agentLabel ? `What ${a.agentLabel} planned or published` : "Plans and documents",
    badge: a.state.unseen ? (
      <span className="pl-dot" role="img" aria-label="New plan" />
    ) : a.state.count > 1 ? (
      <span className="count">{a.state.count}</span>
    ) : undefined,
    section: a.section,
    hidden: !a.state.visible,
    menuHint: PLAN_MENU_HINT,
    onReveal: () => reveal(true),
    onClose: a.state.peeking ? () => reveal(false) : undefined,
    render: () => <PlanPanel workspaceId={a.workspaceId} agentTab={a.agentTab} />,
  };
}
