import { SidePanel, type SideView } from "@/components/SidePanel";
import { useSidePanel } from "@/components/useSidePanel";
import { TurnSection } from "@/domains/agent/TurnSection";
import { WorkspaceSection } from "@/domains/agent/WorkspaceSection";
import { OrchestratorPane } from "@/domains/orchestrator/OrchestratorPane";
import { PrRailSection } from "@/domains/prs/PrRailSection";
import { StartedSessionsSection, useStartedSessions } from "./StartedSessions";

interface SessionPanelProps {
  sessionId: string;
  /** The agent tab in view — its last turn is what the panel quotes. */
  activeWorkspaceId: string;
  /** Every agent's workspace id (for the workspace's PR watch). */
  turnIds: string[];
  prUrls: string[];
  running: boolean;
}

// A session's right-edge panel: its pull requests (once it has one) and the
// sessions its agents started, or the orchestrator — one at a time, remembered
// for sessions in general.
export function SessionPanel({
  sessionId,
  activeWorkspaceId,
  turnIds,
  prUrls,
  running,
}: SessionPanelProps) {
  const hasPr = prUrls.length > 0;
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
      label: hasPr ? "Pull requests" : "Details",
      count: hasPr ? prUrls.length : started,
      content: (
        <div className="detail-right">
          {hasPr && <PrRailSection urls={prUrls} />}
          <StartedSessionsSection workspaceId={sessionId} />
          <TurnSection workspaceId={activeWorkspaceId} hasPr />
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
