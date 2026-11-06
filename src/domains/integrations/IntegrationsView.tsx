import { useState } from "react";
import { useIssuesStore } from "@/domains/issues/store";
import { IntegrationDialog } from "./IntegrationDialog";
import { INTEGRATIONS, type Integration } from "./registry";

function IntegrationCard({
  integration,
  onOpen,
}: {
  integration: Integration;
  onOpen: () => void;
}) {
  const { kind, name, logo, description } = integration;
  const connected = useIssuesStore((s) => Boolean(s.sessions[kind]));
  return (
    <button type="button" className="ig-card" onClick={onOpen}>
      <div className="ig-card-top">
        <img className="ig-logo" src={logo} alt="" />
        {connected && <span className="ig-status">Connected</span>}
      </div>
      <div className="ig-name">{name}</div>
      <div className="ig-desc">{description}</div>
    </button>
  );
}

// Connect and disconnect the services trace works with, one card each. Connecting a
// tracker adds its board to the rail; disconnecting takes it away.
export function IntegrationsView() {
  const sessions = useIssuesStore((s) => s.sessions);
  const [open, setOpen] = useState<Integration | null>(null);

  const connected = INTEGRATIONS.filter((i) => sessions[i.kind]);
  const available = INTEGRATIONS.filter((i) => !sessions[i.kind]);
  const section = (title: string, items: Integration[]) =>
    items.length > 0 && (
      <section className="ig-section">
        <h2>{title}</h2>
        <div className="ig-grid">
          {items.map((i) => (
            <IntegrationCard key={i.kind} integration={i} onOpen={() => setOpen(i)} />
          ))}
        </div>
      </section>
    );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Integrations</h1>
          <div className="desc">Connect a tracker to add its board to the rail.</div>
        </div>
      </div>
      <div className="page-body">
        <div className="ig-wrap">
          {section("Connected integrations", connected)}
          {section("Available integrations", available)}
        </div>
      </div>
      {open && <IntegrationDialog integration={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
