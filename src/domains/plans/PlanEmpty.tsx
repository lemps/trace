import { useContext } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { fillAgentInput } from "@/domains/agentChat/deliver";
import { PaneAreaContext } from "@/domains/panes/context";

/** What "Ask the agent to publish a plan" puts in front of the agent, unsent. */
export const ASK_FOR_PLAN =
  "Please publish your plan for this task to my Plan tab in trace, as Markdown, with the publish_document tool.";

/** Put `text` in the agent's composer (or terminal prompt) and show its tab. */
export function useFillAgent(workspaceId: string, agentTab: string) {
  const area = useContext(PaneAreaContext);
  return (text: string) =>
    fillAgentInput(workspaceId, text)
      .then((where) => {
        area?.panes.select(agentTab);
        if (where === "terminal")
          toast.success("Typed into the agent's prompt. Press Enter to send it.");
      })
      .catch((e) => toast.error(`Couldn't reach the agent: ${String(e)}`));
}

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
