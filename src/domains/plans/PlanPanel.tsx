import { useEffect, useMemo, useRef, useState } from "react";
import { AutoSidebar } from "@/components/AutoSidebar";
import { I } from "@/components/Icon";
import { ChatViewContext } from "@/domains/agentChat/chatContext";
import { useWorkspaceRoot } from "@/domains/agentChat/hooks/useWorkspaceRoot";
import { groupSeries } from "./model";
import { PlanEmpty } from "./PlanEmpty";
import { PlanList, TASKS } from "./PlanList";
import { PlanViewer } from "./PlanViewer";
import { usePlanDocs, usePlanStore, usePlanTasks } from "./store";
import { TaskView } from "./TaskView";

interface PlanPanelProps {
  workspaceId: string;
  /** The agent's own tab, shown when something is put in its composer. */
  agentTab: string;
}

// The Plan tab: what the agent planned or published, newest first, with each
// document's versions, beside its live task list. The list folds away while it
// isn't pointed at (AutoSidebar), so the document has the pane. Markdown renders with the chat's
// prose styles (Settings → Appearance → Chat & transcript); HTML in a sandboxed
// iframe, as the old HTML tab's cards did. Opening the tab marks its news seen.
export function PlanPanel({ workspaceId, agentTab }: PlanPanelProps) {
  const docs = usePlanDocs(workspaceId);
  const tasks = usePlanTasks(workspaceId);
  const markSeen = usePlanStore((s) => s.markSeen);
  const root = useWorkspaceRoot(workspaceId);
  const series = useMemo(() => groupSeries(docs), [docs]);
  const hasTasks = (tasks?.items.length ?? 0) > 0;
  const [picked, setPicked] = useState<string | null>(null);

  // A new document is opened as it lands; a manual pick sticks until the next one.
  const newest = series[0]?.latest.id ?? null;
  const newestRef = useRef(newest);
  useEffect(() => {
    if (newest !== newestRef.current) {
      newestRef.current = newest;
      setPicked(series[0]?.series ?? null);
    }
  }, [newest, series]);
  // On screen, everything up to the newest is seen (clears the tab's dot).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-mark when docs change
  useEffect(() => markSeen(workspaceId), [markSeen, workspaceId, docs]);

  const chatView = useMemo(() => ({ workspaceId, root, expandAll: false }), [workspaceId, root]);

  if (series.length === 0 && !hasTasks) {
    return (
      <div className="pl-pane">
        <PlanEmpty workspaceId={workspaceId} agentTab={agentTab} />
      </div>
    );
  }
  const selected =
    picked === TASKS && hasTasks
      ? TASKS
      : (series.find((s) => s.series === picked)?.series ??
        series[0]?.series ??
        (hasTasks ? TASKS : null));
  const current = series.find((s) => s.series === selected) ?? null;

  return (
    <ChatViewContext.Provider value={chatView}>
      <div className="pl-pane">
        <div className="pl-split">
          <AutoSidebar
            id="plans"
            label="Plans"
            icon={I.Plan}
            count={series.length + (hasTasks ? 1 : 0)}
            width={248}
          >
            <PlanList series={series} tasks={tasks} selected={selected} onSelect={setPicked} />
          </AutoSidebar>
          <div className="pl-main">
            {selected === TASKS && tasks ? (
              <TaskView tasks={tasks} />
            ) : current ? (
              <PlanViewer
                key={current.series}
                workspaceId={workspaceId}
                agentTab={agentTab}
                series={current}
              />
            ) : null}
          </div>
        </div>
      </div>
    </ChatViewContext.Provider>
  );
}
