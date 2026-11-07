import { toast } from "@/app/toast";
import type { MenuItem } from "@/components/PopMenu";
import type { AgentCli } from "@/ipc/agent";
import { useSwitchBlocker } from "./switch";
import { useAgentTransport, useHasChat } from "./transport";
import type { Transport } from "./types";

interface AgentMenuArgs {
  workspaceId: string;
  cli: AgentCli;
  running: boolean;
  /** Stop, wait, start again: on `transport` when moving between chat and terminal. */
  restart: (transport?: Transport) => Promise<void>;
  /** Start a stopped agent on `transport`. */
  start: (transport: Transport) => Promise<void>;
}

/**
 * The agent's own items for a detail header's `…` menu: Restart, and moving it
 * between the chat and the terminal. A move is only offered while the agent is
 * idle (`switch.ts`); either way the conversation carries on (`--resume`).
 */
export function useAgentMenuItems({
  workspaceId,
  cli,
  running,
  restart,
  start,
}: AgentMenuArgs): MenuItem[] {
  const current = useAgentTransport(workspaceId);
  const canChat = useHasChat(cli);
  const to: Transport = current === "chat" ? "terminal" : "chat";
  const blocker = useSwitchBlocker(workspaceId, to);
  const items: MenuItem[] = [];
  const run = (work: Promise<void>) =>
    void work.catch((e) => toast.error(`Couldn't do that: ${String(e)}`));
  if (running) items.push({ label: "Restart agent", onSelect: () => run(restart()) });
  if (current === "chat" || (current !== undefined && canChat)) {
    const label = to === "terminal" ? "Open in terminal" : "Open as chat";
    items.push({
      id: "switch",
      label: blocker ? `${label} (when idle: ${blocker})` : label,
      disabled: blocker !== null,
      onSelect: () => run(running ? restart(to) : start(to)),
    });
  }
  return items;
}
