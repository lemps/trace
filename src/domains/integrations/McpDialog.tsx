import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { InlineConfirm } from "@/components/InlineConfirm";
import { Modal } from "@/components/Modal";
import {
  type McpServerStatus,
  mcpConnect,
  mcpDisconnect,
  mcpServers,
  NEEDS_CLIENT_ID,
  REDIRECT_URI,
} from "@/ipc/mcp";
import { MCP } from "./mcp";

// MCP servers' details: every HTTP server in your Claude config (and your repos'
// .mcp.json), each with trace's own login to it. Connecting opens the server's login in
// your browser; agents in a Vercel sandbox then reach it, the token added by the
// sandbox's network so it never enters the VM. Agents on this computer are unaffected.
export function McpDialog({ onClose }: { onClose: () => void }) {
  const [servers, setServers] = useState<McpServerStatus[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [needsClient, setNeedsClient] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");

  useEffect(() => {
    mcpServers()
      .then(setServers)
      .catch((e) => toast.error(`Couldn't list MCP servers: ${String(e)}`));
  }, []);

  const connect = (s: McpServerStatus, id?: string) => {
    setBusy(s.url);
    mcpConnect(s.name, s.url, id)
      .then((list) => {
        setServers(list);
        setNeedsClient(null);
        setClientId("");
        toast.success(`Connected ${s.name}.`);
      })
      .catch((e) => {
        if (String(e).includes(NEEDS_CLIENT_ID)) setNeedsClient(s.url);
        else toast.error(`Couldn't connect ${s.name}: ${String(e)}`);
      })
      .finally(() => setBusy(null));
  };
  const disconnect = (s: McpServerStatus) => {
    mcpDisconnect(s.url)
      .then(setServers)
      .catch((e) => toast.error(`Couldn't disconnect ${s.name}: ${String(e)}`));
  };

  return (
    <Modal title={MCP.name} onClose={onClose}>
      <div className="ig-dialog">
        <div className="ig-dialog-head">
          <img className="ig-logo" src={MCP.logo} alt="" />
          <div className="ig-dialog-text">
            <div className="ig-desc">{MCP.description}</div>
            <div className="ig-account">
              Connected ones reach every Vercel session. Agents on this computer use Claude Code's
              own logins.
            </div>
          </div>
        </div>
        {servers === null ? (
          <div className="ig-note">Looking for servers…</div>
        ) : servers.length === 0 ? (
          <div className="ig-note">
            No HTTP MCP servers in your Claude config. Add one with claude mcp add, then come back.
          </div>
        ) : (
          <ul className="ig-devices">
            {servers.map((s) => (
              <li key={s.url} className="mcp-server">
                <div className="mcp-server-row">
                  <span className="mcp-name">{s.name}</span>
                  <span className="mcp-host" title={s.url}>
                    {s.host}
                  </span>
                  <span className="mcp-state">{stateWord(s)}</span>
                  {s.connected ? (
                    <InlineConfirm
                      label="Disconnect"
                      message={`Forget trace's ${s.name} login?`}
                      confirmLabel="Disconnect"
                      onConfirm={() => disconnect(s)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="btn mcp-connect"
                      disabled={busy !== null}
                      onClick={() => connect(s)}
                    >
                      {busy === s.url ? "Waiting…" : "Connect"}
                    </button>
                  )}
                </div>
                {needsClient === s.url && (
                  <div className="field mcp-client">
                    <label htmlFor="mcp-client-id">Client ID</label>
                    <input
                      id="mcp-client-id"
                      autoComplete="off"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && clientId.trim() && connect(s, clientId.trim())
                      }
                    />
                    <span className="hint">
                      {s.host} can't register trace itself. Register trace with it once, as a public
                      client (no secret) with redirect <code>{REDIRECT_URI}</code>, and paste its
                      client ID.
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function stateWord(s: McpServerStatus): string {
  if (!s.connected) return "Not connected";
  if (s.refreshable || s.expiresAt === null) return "Connected";
  const left = s.expiresAt - Date.now();
  if (left <= 0) return "Expired";
  const at = new Date(s.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `Until ${at}`;
}
