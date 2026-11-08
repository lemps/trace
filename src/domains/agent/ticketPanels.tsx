import type { ReactNode } from "react";
import { I } from "@/components/Icon";
import type { Issue } from "@/domains/issues/types";
import type { PanelDescriptor } from "@/domains/panes/types";
import { planTab } from "@/domains/plans/planTab";
import type { PlanTabState } from "@/domains/plans/store";
import { PrRailSection } from "@/domains/prs/PrRailSection";
import type { AgentCli } from "@/ipc/agent";
import { AgentViewSwitch } from "./AgentViewSwitch";
import { FilesPane } from "./FilesPane";
import { TerminalPane } from "./TerminalPane";
import { TestsPane } from "./TestsPane";
import { TicketPane } from "./TicketPane";
import { type ViewerTabsState, viewerTabs } from "./viewerTabs";

/** The ticket agent's tab id; subagent panels open beside it. */
export const TICKET_CHAT_TAB = "chat";

interface TicketPanelsArgs {
  issue: Issue;
  cli: AgentCli;
  /** The agent's own view: its chat, or its terminal under the start prompt. */
  chat: ReactNode;
  plan: PlanTabState;
  viewers: ViewerTabsState;
  prUrls: string[];
}

/** A ticket's tabs, in their natural order (⌘1–7, counting only those shown). */
export function ticketPanels({ issue, cli, chat, plan, viewers, prUrls }: TicketPanelsArgs) {
  const panels: PanelDescriptor[] = [
    {
      id: TICKET_CHAT_TAB,
      label: "Chat",
      icon: I.Chat,
      toolbar: <AgentViewSwitch workspaceId={issue.key} cli={cli} />,
      render: () => chat,
    },
    planTab({ workspaceId: issue.key, agentTab: TICKET_CHAT_TAB, state: plan }),
    ...viewerTabs(issue.key, viewers),
    { id: "ticket", label: "Ticket", icon: I.Ticket, render: () => <TicketPane issue={issue} /> },
    {
      id: "files",
      label: "Files",
      icon: I.Code,
      render: () => <FilesPane workspaceId={issue.key} />,
    },
    {
      id: "terminal",
      label: "Terminal",
      icon: I.Terminal,
      render: () => <TerminalPane issueKey={issue.key} />,
    },
    { id: "tests", label: "Tests", icon: I.Beaker, render: () => <TestsPane issue={issue} /> },
    {
      id: "pr",
      label: "Pull request",
      icon: I.GitPR,
      render: () => (
        <div className="tab-pane pr-tab">
          {prUrls.length > 0 ? (
            <PrRailSection urls={prUrls} />
          ) : (
            <div className="pr-muted">
              No pull request yet — raise one from the header, or it appears here as soon as the
              agent opens one.
            </div>
          )}
        </div>
      ),
    },
  ];
  return panels;
}
