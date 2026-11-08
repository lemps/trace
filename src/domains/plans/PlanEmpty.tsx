import { I } from "@/components/Icon";
import { ASK_FOR_PLAN, useFillAgent } from "./useFillAgent";

// Nothing to show yet: say how plans get here, and offer to ask for one.
export function PlanEmpty({ workspaceId, agentTab }: { workspaceId: string; agentTab: string }) {
  const fill = useFillAgent(workspaceId, agentTab);
  return (
    <div className="pl-empty">
      <I.Plan size={18} />
      <div className="pl-empty-title">No plan yet</div>
      <p>
        A plan appears here when the agent leaves plan mode, or when it publishes a plan, spec or
        report to trace. Each new plan is kept as a version you can compare and export.
      </p>
      <button type="button" className="btn" onClick={() => void fill(ASK_FOR_PLAN)}>
        <I.Chat size={13} /> Ask the agent to publish a plan
      </button>
    </div>
  );
}
