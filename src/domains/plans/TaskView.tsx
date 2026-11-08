import { PlanCard } from "@/domains/agentChat/PlanCard";
import type { TaskList } from "@/ipc/plans";
import { shortTime } from "./time";

// The agent's live task list (Claude's TodoWrite, the chat journal's plan rows,
// Codex's plan updates): the chat's own plan card, changing in place.
export function TaskView({ tasks }: { tasks: TaskList }) {
  return (
    <div className="pl-doc">
      <div className="pl-head">
        <div className="pl-head-text">
          <h2 className="pl-title">Task list</h2>
          <div className="pl-meta">
            Updated {shortTime(tasks.updatedAt)} · changes as the agent works
          </div>
        </div>
      </div>
      <div className="pl-body">
        <PlanCard plan={tasks} />
      </div>
    </div>
  );
}
