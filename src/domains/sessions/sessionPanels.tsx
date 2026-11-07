import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";
import { AgentViewSwitch } from "@/domains/agent/AgentViewSwitch";
import { FilesPane } from "@/domains/agent/FilesPane";
import { RichOutputPanel } from "@/domains/agent/RichOutputPanel";
import { TerminalPane } from "@/domains/agent/TerminalPane";
import type { LiveInfo } from "@/domains/live/types";
import type { PanelDescriptor } from "@/domains/panes/types";
import type { AgentCli, AgentProvider } from "@/ipc/agent";
import { AddAgentMenu } from "./AddAgentMenu";
import type { RosterEntry } from "./agentRoster";
import { SessionAgentTab } from "./SessionAgentTab";
import type { ScratchSession } from "./types";

/** An agent's tab id in a session's layout. */
export const agentTab = (workspaceId: string) => `agent:${workspaceId}`;

/** The agent a tab id names, or null for the workspace tabs. */
export const agentOfTab = (tab: string) => (tab.startsWith("agent:") ? tab.slice(6) : null);

interface SessionPanelsArgs {
  session: ScratchSession;
  roster: RosterEntry[];
  /** The agent the header acts on; HTML shows what it rendered. */
  active: RosterEntry;
  live: Record<string, LiveInfo>;
  htmlCount: number;
  onAddAgent: (cli: AgentCli, provider?: AgentProvider) => void;
  addDisabled: boolean;
}

/**
 * A session's tabs, in their natural order: one per agent (a status dot each, the
 * "+" after the last), then HTML, Files (only with git) and Terminal after a rule.
 * Files and Terminal are the worktree's, whichever agent is in front.
 */
export function sessionPanels(a: SessionPanelsArgs): PanelDescriptor[] {
  const place = a.session.folder ? "folder" : "worktree";
  const agents = a.roster.map(
    (entry, i): PanelDescriptor => ({
      id: agentTab(entry.workspaceId),
      label: entry.label,
      icon: I.Chat,
      section: "agents",
      title: entry.companion ? `Companion agent — same ${place}` : "This session's agent",
      badge: <StatusLight light={a.live[entry.workspaceId]?.light ?? "stopped"} />,
      toolbar: <AgentViewSwitch workspaceId={entry.workspaceId} cli={entry.cli} />,
      after:
        i === a.roster.length - 1 ? (
          <AddAgentMenu onAdd={a.onAddAgent} disabled={a.addDisabled} />
        ) : undefined,
      render: () => <SessionAgentTab key={entry.workspaceId} session={a.session} entry={entry} />,
    })
  );
  return [
    ...agents,
    {
      id: "html",
      label: "HTML",
      icon: I.Sparkles,
      title: `What ${a.active.label} rendered with trace-render`,
      badge: a.htmlCount > 0 ? <span className="count">{a.htmlCount}</span> : undefined,
      section: "workspace",
      render: () => <RichOutputPanel issueKey={a.active.workspaceId} />,
    },
    ...(a.session.folder
      ? []
      : [
          {
            id: "files",
            label: "Files",
            icon: I.Code,
            section: "workspace",
            render: () => <FilesPane workspaceId={a.session.id} />,
          },
        ]),
    {
      id: "terminal",
      label: "Terminal",
      icon: I.Terminal,
      section: "workspace",
      render: () => <TerminalPane issueKey={a.session.id} />,
    },
  ];
}
