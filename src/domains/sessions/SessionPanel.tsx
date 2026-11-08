import { SidePanel, type SideView } from "@/components/SidePanel";
import { useSidePanel } from "@/components/useSidePanel";
import { TurnSection } from "@/domains/agent/TurnSection";
import { WorkspaceSection } from "@/domains/agent/WorkspaceSection";
import { OrchestratorPane } from "@/domains/orchestrator/OrchestratorPane";
import { StartedSessionsSection, useStartedSessions } from "./StartedSessions";

interface SessionPanelProps {
  sessionId: string;
  /** The agent tab in view — its last turn is what the panel quotes. */
  activeWorkspaceId: string;
  /** Every agent's workspace id (for the workspace's PR watch). */
  turnIds: string[];
  /** Whether the session has raised a PR (it shows in the Pull request tab, not here). */
  hasPr: boolean;
  running: boolean;
}

// A session's right-edge panel: its details (once it has a PR or has started
// sessions) or the orchestrator — one at a time, remembered for sessions in
// general. The PRs themselves live in the workspace's Pull request tab.
export function SessionPanel({
  sessionId,
  activeWorkspaceId,
  turnIds,
  hasPr,
  running,
}: SessionPanelProps) {
  const started = useStartedSessions(sessionId).length;
  const hasContext = hasPr || started > 0;
  const panel = useSidePanel(
    "session",
    hasContext ? ["context", "orchestrator"] : ["orchestrator"]
  );
  const views: SideView[] = [
    { id: "orchestrator", label: "Orchestrator", content: <OrchestratorPane /> },
  ];
  if (hasContext) {
    views.unshift({
      id: "context",
      label: "Details",
      count: started,
      content: (
        <div className="detail-right">
          <StartedSessionsSection workspaceId={sessionId} />
          <TurnSection workspaceId={activeWorkspaceId} hasPr={hasPr} />
          <WorkspaceSection workspaceId={sessionId} turnIds={turnIds} refreshKey={running} />
        </div>
      ),
    });
  }
  return (
    <SidePanel
      views={views}
      active={panel.view}
      open={panel.open}
      onShow={panel.show}
      onClose={panel.close}
    />
  );
}
