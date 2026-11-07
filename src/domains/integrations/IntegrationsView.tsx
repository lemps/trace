import { type ReactNode, useEffect, useState } from "react";
import { useGitHubStore } from "@/domains/github/store";
import { useIssuesStore } from "@/domains/issues/store";
import { GitHubDialog } from "./GitHubDialog";
import { GITHUB } from "./github";
import { IntegrationDialog } from "./IntegrationDialog";
import { INTEGRATIONS, type Integration } from "./registry";

interface CardProps {
  name: string;
  logo: string;
  description: string;
  connected: boolean;
  onOpen: () => void;
}

function IntegrationCard({ name, logo, description, connected, onOpen }: CardProps) {
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
// tracker adds its board to the rail; disconnecting takes it away. GitHub is about
// code rather than a board: signed in with trace's own token, it opens the repo browser.
export function IntegrationsView() {
  const sessions = useIssuesStore((s) => s.sessions);
  const githubLogin = useGitHubStore((s) => s.status?.login);
  const checkGitHub = useGitHubStore((s) => s.checkStatus);
  const [open, setOpen] = useState<Integration | null>(null);
  const [githubOpen, setGithubOpen] = useState(false);

  useEffect(() => void checkGitHub(), [checkGitHub]);

  const card = (i: Integration) => (
    <IntegrationCard
      key={i.kind}
      {...i}
      connected={Boolean(sessions[i.kind])}
      onOpen={() => setOpen(i)}
    />
  );
  const githubCard = (
    <IntegrationCard
      key="github"
      {...GITHUB}
      connected={Boolean(githubLogin)}
      onOpen={() => setGithubOpen(true)}
    />
  );
  const connected = INTEGRATIONS.filter((i) => sessions[i.kind]).map(card);
  const available = INTEGRATIONS.filter((i) => !sessions[i.kind]).map(card);
  (githubLogin ? connected : available).push(githubCard);
  const section = (title: string, items: ReactNode[]) =>
    items.length > 0 && (
      <section className="ig-section">
        <h2>{title}</h2>
        <div className="ig-grid">{items}</div>
      </section>
    );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Integrations</h1>
          <div className="desc">
            Connect a tracker to add its board to the rail, or GitHub to check out repos.
          </div>
        </div>
      </div>
      <div className="page-body">
        <div className="ig-wrap">
          {section("Connected integrations", connected)}
          {section("Available integrations", available)}
        </div>
      </div>
      {open && <IntegrationDialog integration={open} onClose={() => setOpen(null)} />}
      {githubOpen && <GitHubDialog onClose={() => setGithubOpen(false)} />}
    </div>
  );
}
