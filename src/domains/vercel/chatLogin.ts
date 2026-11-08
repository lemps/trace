import { useSessionsStore } from "@/domains/sessions/store";
import { useVercelStatus } from "./store";

/** Why a sandbox session can't move to chat: it would have nowhere to type /login. */
export const CHAT_NEEDS_LOGIN = "needs a Claude login saved in Integrations → Vercel";

/**
 * Why `workspaceId`'s agent can't be opened as a chat, or null when it can. A
 * session in a Vercel Sandbox with no Claude login saved for sandboxes logs in
 * with /login, which only its terminal has somewhere to type.
 */
export function useSandboxChatBlocker(workspaceId: string): string | null {
  const onSandbox = useSessionsStore((s) =>
    s.sessions.some((x) => x.id === workspaceId && Boolean(x.host))
  );
  const claude = useVercelStatus()?.claude ?? null;
  return onSandbox && !claude ? CHAT_NEEDS_LOGIN : null;
}
