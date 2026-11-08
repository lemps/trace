import { useContext } from "react";
import { toast } from "@/app/toast";
import { fillAgentInput } from "@/domains/agentChat/deliver";
import { PaneAreaContext } from "@/domains/panes/context";

/** What "Ask the agent to publish a plan" puts in front of the agent, unsent. */
export const ASK_FOR_PLAN =
  "Please publish your plan for this task to my Plan tab in trace, as Markdown, with the publish_document tool.";

/** Put `text` in the agent's composer (or terminal prompt), unsent, and show its tab. */
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
