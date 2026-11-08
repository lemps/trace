import { I } from "@/components/Icon";
import { comingFields } from "@/domains/panes/coming";
import type { PanelDescriptor } from "@/domains/panes/types";
import { PlanPanel } from "./PlanPanel";
import type { PlanTabState } from "./store";

/**
 * The Plan tab's id. It was the HTML tab's, and stays "html" so layouts saved
 * with that tab in them put Plan in its place.
 */
export const PLAN_TAB = "html";

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
 * The Plan tab as a panel, under the tabs rule (.claude/rules/tabs.md): there with a
 * document or a task list, hidden by its ×, back with the next document. It carries
 * a dot while a new document is unseen. It can't open empty: a plan comes from the agent.
 */
export function planTab(a: PlanTabArgs): PanelDescriptor {
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
    ...comingFields(a.state.coming, false),
    render: () => <PlanPanel workspaceId={a.workspaceId} agentTab={a.agentTab} />,
  };
}
