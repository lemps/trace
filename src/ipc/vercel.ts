import { invoke } from "@tauri-apps/api/core";
import type { ScratchSession } from "@/domains/sessions/types";

// The Vercel integration (`commands/vercel.rs`): sessions that run in a Vercel
// Sandbox. The Vercel token and the Claude login handed to sandboxes stay on the
// Rust side; nothing here returns either, only which kind of Claude login is set.

/** The Claude login sandboxes get: a `claude setup-token` OAuth token, or an API key. */
export type ClaudeCredentialKind = "oauthToken" | "apiKey";

export interface VercelStatus {
  /** Vercel username. */
  user: string;
  /** Team slug. */
  team: string;
  /** The project trace keeps its sandboxes in. */
  project: string;
  /** Which Claude login sandboxes get; null = log in inside the session with /login. */
  claude: ClaudeCredentialKind | null;
}

/** A trace session living in a Vercel sandbox, seen by any trace with the same token. */
export interface RemoteSandboxSession {
  /** The session id it was started under. */
  workspaceId: string;
  title: string;
  /** "owner/name". */
  repo: string | null;
  /** Sandbox name. */
  sandbox: string;
  /** Vercel's own word: "running", "stopped", "pending", … */
  status: string;
  /** Epoch ms. */
  createdAt: number;
}

/** Null when Vercel isn't connected. */
export function vercelStatus(): Promise<VercelStatus | null> {
  return invoke("vercel_status");
}

/** Check a token with Vercel and keep it. Errors are readable as they are. */
export function connectVercel(token: string): Promise<VercelStatus> {
  return invoke("connect_vercel", { token });
}

export function disconnectVercel(): Promise<void> {
  return invoke("disconnect_vercel");
}

/** Keep the Claude login sandboxes get. The secret is write-only from here on. */
export function setClaudeCredential(
  kind: ClaudeCredentialKind,
  secret: string
): Promise<VercelStatus> {
  return invoke("set_claude_credential", { kind, secret });
}

/** Forget it: sandboxes then log in with /login inside the session. */
export function clearClaudeCredential(): Promise<VercelStatus> {
  return invoke("clear_claude_credential");
}

/** Every trace session on Vercel, from any trace with this token. */
export function listRemoteSessions(): Promise<RemoteSandboxSession[]> {
  return invoke("list_remote_sessions");
}

/** Adopt one as a local session with the same id. */
export function joinRemoteSession(workspaceId: string): Promise<ScratchSession> {
  return invoke("join_remote_session", { workspaceId });
}
