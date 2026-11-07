import { toast } from "@/app/toast";
import { useChatActions } from "../actions";
import { useChatView } from "../chatContext";
import { useAgentChatStore } from "../store";
import type { Answer } from "../types";

/**
 * Answer an approval or question in place. `busy` holds while the answer is on
 * its way; the card shows its resolution once the agent's row says so.
 */
export function useAnswer(requestId: string): { busy: boolean; submit: (a: Answer) => void } {
  const { workspaceId } = useChatView();
  const actions = useChatActions();
  const key = `${workspaceId}:${requestId}`;
  const busy = useAgentChatStore((s) => s.answering[key] ?? false);
  const submit = (answer: Answer) => {
    const { setAnswering } = useAgentChatStore.getState();
    setAnswering(key, true);
    void actions
      .answer(workspaceId, requestId, answer)
      .catch((e) => toast.error(`Couldn't send the answer: ${String(e)}`))
      .finally(() => setAnswering(key, false));
  };
  return { busy, submit };
}
