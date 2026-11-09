import { invoke } from "@tauri-apps/api/core";

// trace's own logins to the team's MCP servers (`commands/mcp.rs`), which agents in
// a cloud sandbox use. Tokens stay on the Rust side; this only says which are connected.

/** An HTTP MCP server configured on this machine, and whether trace is logged in to it. */
export interface McpServerStatus {
  /** Its name in the config (its tools' prefix). */
  name: string;
  url: string;
  host: string;
  connected: boolean;
  /** Epoch ms the current token expires, when the server said. */
  expiresAt: number | null;
  /** trace can renew it without the browser. */
  refreshable: boolean;
}

/** The error `mcpConnect` rejects with when the server can't register trace itself. */
export const NEEDS_CLIENT_ID = "needs-client-id";

/** Where a server that can't register trace itself has it registered once, by hand. */
export const REDIRECT_URI = "http://127.0.0.1:47321/callback";

export function mcpServers(): Promise<McpServerStatus[]> {
  return invoke("mcp_servers");
}

/** Log in through the browser; resolves once the browser comes back. */
export function mcpConnect(
  name: string,
  url: string,
  clientId?: string
): Promise<McpServerStatus[]> {
  return invoke("mcp_connect", { name, url, clientId: clientId ?? null });
}

export function mcpDisconnect(url: string): Promise<McpServerStatus[]> {
  return invoke("mcp_disconnect", { url });
}
