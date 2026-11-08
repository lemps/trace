import { toast } from "@/app/toast";
import type { MenuItem } from "@/components/PopMenu";
import { useCapabilities } from "@/domains/agent/capabilities";
import { useSandboxChatBlocker } from "@/domains/vercel/chatLogin";
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
  const hasChat = useHasChat(cli);
  // A host without a chat (none today: a sandbox has both) offers no move to one.
  const hostChats = useCapabilities(workspaceId)?.chat !== false;
  const canChat = hasChat && hostChats;
  const to: Transport = current === "chat" ? "terminal" : "chat";
  // A sandbox with no Claude login saved can only /login in its terminal.
  const noLogin = useSandboxChatBlocker(workspaceId);
  const idleBlocker = useSwitchBlocker(workspaceId, to);
  const why = to === "chat" && noLogin ? noLogin : idleBlocker && `when idle: ${idleBlocker}`;
  const items: MenuItem[] = [];
  const run = (work: Promise<void>) =>
    void work.catch((e) => toast.error(`Couldn't do that: ${String(e)}`));
  if (running) items.push({ label: "Restart agent", onSelect: () => run(restart()) });
  // Only Claude's chat and TUI share one conversation (`claude::conversations`):
  // Codex's chat thread isn't one its TUI can resume, so it doesn't move across.
  if (cli === "claude" && (current === "chat" || (current !== undefined && canChat))) {
    const label = to === "terminal" ? "Open in terminal" : "Open as chat";
    items.push({
      id: "switch",
      label: why ? `${label} (${why})` : label,
      disabled: Boolean(why),
      onSelect: () => run(running ? restart(to) : start(to)),
    });
  }
  return items;
}
