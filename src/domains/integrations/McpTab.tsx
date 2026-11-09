import { type ReactNode, useState } from "react";
import type { McpServerStatus } from "@/ipc/mcp";
import { AddMcpDialog } from "./AddMcpDialog";
import { McpLogo } from "./McpLogo";
import { McpServerDialog } from "./McpServerDialog";
import { useMcpServers } from "./useMcpServers";

// Integrations → MCP servers: what's connected, what's in your Claude config, and a
// curated list of popular servers, each a card; plus "Add your own…" for any other.
// Connected servers reach trace's agents on this computer, in sandboxes, or both.
export function McpTab() {
  const { servers, set } = useMcpServers();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const shown = servers?.find((s) => s.url === open) ?? null;

  const card = (s: McpServerStatus) => (
    <button key={s.url} type="button" className="ig-card mcp-card" onClick={() => setOpen(s.url)}>
      <div className="ig-card-top">
        <McpLogo id={s.catalogId} name={s.name} />
        {s.connected && <span className="ig-status">Connected</span>}
      </div>
      <div className="ig-name mcp-card-name">{s.name}</div>
      <div className="ig-desc">{s.about ?? s.host}</div>
      {s.connected && <div className="mcp-card-use">{usedBy(s)}</div>}
    </button>
  );
  const section = (title: string, items: McpServerStatus[], note?: ReactNode) =>
    items.length > 0 && (
      <section className="ig-section">
        <h2>{title}</h2>
        {note && <div className="ig-note mcp-section-note">{note}</div>}
        <div className="ig-grid">{items.map(card)}</div>
      </section>
    );
  const list = servers ?? [];
  const waiting = list.filter((s) => !s.connected);

  return (
    <div className="ig-wrap">
      <div className="mcp-head">
        <div className="ig-note">
          Give trace's agents your tools. Each server you connect logs in once, here; agents on this
          computer and in Vercel sandboxes use it without ever seeing the login.
        </div>
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          Add your own…
        </button>
      </div>
      {servers === null && <div className="ig-note">Looking for servers…</div>}
      {section(
        "Connected",
        list.filter((s) => s.connected)
      )}
      {section(
        "From your Claude config",
        waiting.filter((s) => s.source === "config"),
        "Agents on this computer have these already. Connect one to give it to sandboxes too."
      )}
      {section(
        "Popular",
        waiting.filter((s) => s.source === "catalog")
      )}
      {section(
        "Added by you",
        waiting.filter((s) => s.source === "custom")
      )}
      {shown && <McpServerDialog server={shown} onClose={() => setOpen(null)} onChange={set} />}
      {adding && <AddMcpDialog onClose={() => setAdding(false)} onAdded={set} />}
    </div>
  );
}

function usedBy(s: McpServerStatus): string {
  if (s.local && s.remote) return "This computer · Sandboxes";
  if (s.local) return "This computer";
  if (s.remote) return "Sandboxes";
  return "Switched off";
}
