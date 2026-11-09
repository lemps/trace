import { useState } from "react";
import { toast } from "@/app/toast";
import { BusyLabel } from "@/components/BusyLabel";
import { Modal } from "@/components/Modal";
import { type McpServerStatus, mcpAdd, NEEDS_CLIENT_ID, REDIRECT_URI } from "@/ipc/mcp";

interface Props {
  onClose: () => void;
  onAdded: (list: McpServerStatus[]) => void;
}

// Add an MCP server trace doesn't list: its URL and a name for its tools. With a key,
// it's sent in a header; without, trace logs in through the browser if the server asks
// for it, or adds it as it is if it doesn't. A server that can't register trace itself
// asks for a client ID it was registered with once.
export function AddMcpDialog({ onClose, onAdded }: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [header, setHeader] = useState("Authorization");
  const [clientId, setClientId] = useState("");
  const [needsClient, setNeedsClient] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = () => {
    if (!name.trim() || !url.trim() || busy) return;
    setBusy(true);
    mcpAdd({
      name: name.trim(),
      url: url.trim(),
      key: key.trim() || undefined,
      header: key.trim() ? header.trim() || "Authorization" : undefined,
      clientId: clientId.trim() || undefined,
    })
      .then((list) => {
        onAdded(list);
        toast.success(`Added ${name.trim()}.`);
        onClose();
      })
      .catch((e) => {
        if (String(e).includes(NEEDS_CLIENT_ID)) setNeedsClient(true);
        else toast.error(String(e));
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Add an MCP server" onClose={onClose}>
      <div className="ig-dialog">
        <div className="field">
          <label htmlFor="mcp-add-url">URL</label>
          <input
            id="mcp-add-url"
            placeholder="https://mcp.example.com/mcp"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <span className="hint">
            A remote (HTTP) server. Servers that run on your computer stay in your Claude config.
          </span>
        </div>
        <div className="field">
          <label htmlFor="mcp-add-name">Name</label>
          <input
            id="mcp-add-name"
            placeholder="example"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="hint">Its tools are called mcp__name__…</span>
        </div>
        <div className="field">
          <label htmlFor="mcp-add-key">Key (optional)</label>
          <input
            id="mcp-add-key"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <span className="hint">
            For a server that takes an API key. Leave it empty and trace logs in through your
            browser if the server asks.
          </span>
        </div>
        {key.trim() && (
          <div className="field">
            <label htmlFor="mcp-add-header">Header</label>
            <input id="mcp-add-header" value={header} onChange={(e) => setHeader(e.target.value)} />
            <span className="hint">
              Where the key goes. A bare key in Authorization is sent as a bearer token.
            </span>
          </div>
        )}
        {needsClient && (
          <div className="field">
            <label htmlFor="mcp-add-client">Client ID</label>
            <input
              id="mcp-add-client"
              autoComplete="off"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
            <span className="hint">
              This server can't register trace itself. Register trace with it once, as a public
              client (no secret) with redirect <code>{REDIRECT_URI}</code>, and paste its client ID.
            </span>
          </div>
        )}
        <div className="ig-form-foot">
          <button
            type="button"
            className="btn primary"
            disabled={busy || !name.trim() || !url.trim()}
            onClick={add}
          >
            <BusyLabel busy={busy} idle="Add" working="Adding…" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
