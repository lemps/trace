import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";
import { AgentViewSwitch } from "@/domains/agent/AgentViewSwitch";
import { prTab, testsTab } from "@/domains/agent/reviewTabs";
import { type ViewerTabsState, viewerTabs } from "@/domains/agent/viewerTabs";
import { filesTab, terminalTab, type WorkspaceTabsState } from "@/domains/agent/workspaceTabs";
import type { LiveInfo } from "@/domains/live/types";
import type { Coming } from "@/domains/panes/coming";
import type { PanelDescriptor } from "@/domains/panes/types";
import { planTab } from "@/domains/plans/planTab";
import type { PlanTabState } from "@/domains/plans/store";
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
  /** The agent the header acts on; Plan shows what it planned or published. */
  active: RosterEntry;
  live: Record<string, LiveInfo>;
  plan: PlanTabState;
  /** Browser and Gallery: what the agent in front showed the user. */
  viewers: ViewerTabsState;
  /** Files and Terminal (the worktree's): shown only with changes, or a shell open. */
  workspace: WorkspaceTabsState;
  /** Tests and Pull request: shown once there's a run, or a PR (never in a folder). */
  tests: Coming;
  pr: Coming;
  prUrls: string[];
  onAddAgent: (cli: AgentCli, provider?: AgentProvider) => void;
  /** Why "+ agent" is off (a sandbox session, the companion cap); null = it works. */
  addBlocked: string | null;
  /** The host reads the checkout for Files (`capabilities.files`): this computer, or a sandbox. */
  hostFiles: boolean;
}

/**
 * A session's tabs, in their natural order: one per agent (a status dot each, the
 * "+" after the last), then after a rule Plan, Browser, Gallery, Files, Terminal, Tests
 * and Pull request, each only with something to show (Files, Tests and Pull request
 * never in a plain folder, which has no git). Files and Terminal are the
 * worktree's, whichever agent is in front. A session on another host (a Vercel
 * Sandbox) has no local folder, so it has no Terminal or Tests; its Files are read
 * in the sandbox when its host can (`hostFiles`), and it keeps Pull request, since
 * the sandbox pushes its branch to GitHub, where its PRs are found.
 */
export function sessionPanels(a: SessionPanelsArgs): PanelDescriptor[] {
  const place = a.session.folder ? "folder" : "worktree";
  // Terminal and Tests need the local folder; Files only a host that can read it.
  const isLocal = !a.session.host;
  const hasGit = isLocal && !a.session.folder;
  const hasFiles = !a.session.folder && (isLocal || a.hostFiles);
  const hasPrs = hasGit || Boolean(a.session.host);
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
          <AddAgentMenu onAdd={a.onAddAgent} blocked={a.addBlocked} />
        ) : undefined,
      render: () => <SessionAgentTab key={entry.workspaceId} session={a.session} entry={entry} />,
    })
  );
  return [
    ...agents,
    planTab({
      workspaceId: a.active.workspaceId,
      agentTab: agentTab(a.active.workspaceId),
      state: a.plan,
      agentLabel: a.active.label,
      section: "workspace",
    }),
    ...viewerTabs(a.active.workspaceId, a.viewers, "workspace"),
    ...(hasFiles ? [filesTab(a.session.id, a.workspace, "workspace")] : []),
    ...(isLocal ? [terminalTab(a.session.id, a.workspace, "workspace")] : []),
    ...(hasGit ? [testsTab(a.session.id, a.tests, "workspace")] : []),
    ...(hasPrs ? [prTab(a.prUrls, a.pr, "workspace")] : []),
  ];
}
