import { useEffect } from "react";
import { agentTransport } from "@/domains/agent/defaults";
import type { AgentCli } from "@/ipc/agent";
import { chatAgentBrands, chatAgentState } from "@/ipc/agentChat";
import { ensureChatListeners } from "./hooks/useJournalFeed";
import { noteChatInfo } from "./liveBridge";
import { useAgentChatStore } from "./store";
import type { Transport } from "./types";

// Which transport each workspace's agent runs on. The backend keeps the choice
// (`agent_session::transport`), so a restart, a resume or a resume after a quit
// runs it the same way; the renderer mirrors it in the chat store, read once per
// workspace when something first asks (`chat_agent_state`) and kept current by
// the starts it makes and the agent's own events.

/** Workspaces whose backend state was read (or is being read). */
const hydrated = new Set<string>();

/** Read a workspace's transport and its chat agent's info from the backend, once. */
export function hydrateChatState(workspaceId: string): void {
  if (hydrated.has(workspaceId)) return;
  hydrated.add(workspaceId);
  void chatAgentState(workspaceId)
    .then(({ transport, info }) => {
      const store = useAgentChatStore.getState();
      // An event that got here first is newer than this answer.
      if (transport && store.transport[workspaceId] === undefined) {
        store.setTransport(workspaceId, transport);
      }
      if (info && store.info[workspaceId] === undefined) {
        noteChatInfo(workspaceId, info);
        store.setInfo(workspaceId, info);
      }
    })
    .catch(() => hydrated.delete(workspaceId));
}

let brandsAsked = false;

/** Ask the backend which CLIs have a chat adapter (once). */
export function loadChatBrands(): void {
  if (brandsAsked) return;
  brandsAsked = true;
  void chatAgentBrands()
    .then((brands) => useAgentChatStore.getState().setBrands(brands))
    .catch(() => {
      brandsAsked = false;
    });
}

/** Whether `cli` can run as a chat agent. */
export function hasChat(cli: AgentCli): boolean {
  return useAgentChatStore.getState().brands.includes(cli);
}

/** `hasChat`, as a hook (Settings and menus re-render once the list arrives). */
export function useHasChat(cli: AgentCli): boolean {
  useEffect(loadChatBrands, []);
  return useAgentChatStore((s) => s.brands.includes(cli));
}

/** What a new agent of `cli` runs on: Settings' default, the terminal for a brand without chat. */
export function defaultTransport(cli: AgentCli): Transport {
  return hasChat(cli) ? agentTransport() : "terminal";
}

/** What the workspace's agent runs on, asking the backend if nothing here knows yet. */
export async function knownTransport(workspaceId: string): Promise<Transport | undefined> {
  const known = useAgentChatStore.getState().transport[workspaceId];
  if (known) return known;
  const state = await chatAgentState(workspaceId).catch(() => null);
  if (state?.transport) noteTransport(workspaceId, state.transport);
  return state?.transport ?? undefined;
}

/**
 * The transport a start uses: the user's choice for this start, else what the
 * workspace ran on last, else the default for its CLI.
 */
export async function resolveTransport(
  workspaceId: string,
  cli: AgentCli,
  chosen?: Transport
): Promise<Transport> {
  const pick = chosen ?? (await knownTransport(workspaceId)) ?? defaultTransport(cli);
  return pick === "chat" && !hasChat(cli) ? "terminal" : pick;
}

/** A start went ahead on `transport`: views switch to match. */
export function noteTransport(workspaceId: string, transport: Transport): void {
  useAgentChatStore.getState().setTransport(workspaceId, transport);
}

/** What a workspace's agent runs on, once known (undefined before it first runs). */
export function useAgentTransport(workspaceId: string): Transport | undefined {
  useEffect(() => {
    ensureChatListeners();
    hydrateChatState(workspaceId);
  }, [workspaceId]);
  return useAgentChatStore((s) => s.transport[workspaceId]);
}

/** Whether a workspace's agent runs as a chat, as far as the renderer knows (outside React). */
export function isChatAgent(workspaceId: string): boolean {
  return useAgentChatStore.getState().transport[workspaceId] === "chat";
}

/** Whether a workspace's agent runs on the chat transport, so its views mount `ChatAgentPane`. */
export function useIsChatAgent(workspaceId: string): boolean {
  return useAgentTransport(workspaceId) === "chat";
}
