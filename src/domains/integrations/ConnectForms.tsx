import { useState } from "react";
import { I } from "@/components/Icon";
import { useIssuesStore } from "@/domains/issues/store";

function FormFoot({ canSubmit, onSubmit }: { canSubmit: boolean; onSubmit: () => void }) {
  const connecting = useIssuesStore((s) => s.connecting);
  const error = useIssuesStore((s) => s.error);
  return (
    <>
      {error && <div className="ig-error">{error}</div>}
      <div className="ig-form-foot">
        <button
          type="button"
          className="btn primary"
          disabled={!canSubmit || connecting}
          onClick={onSubmit}
        >
          <I.Bolt size={13} /> {connecting ? "Connecting…" : "Connect"}
        </button>
      </div>
    </>
  );
}

export function JiraForm() {
  const connect = useIssuesStore((s) => s.connectJira);
  const connecting = useIssuesStore((s) => s.connecting);
  const [site, setSite] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");

  const canSubmit = Boolean(site.trim() && email.trim() && token.trim());
  const submit = () => {
    if (canSubmit && !connecting) void connect(site.trim(), email.trim(), token.trim());
  };

  return (
    <div className="ig-form">
      <div className="field">
        <label htmlFor="jira-site">Site</label>
        <input
          id="jira-site"
          placeholder="your-org.atlassian.net"
          value={site}
          onChange={(e) => setSite(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="jira-email">Email</label>
        <input
          id="jira-email"
          placeholder="you@your-org.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="jira-token">API token</label>
        <input
          id="jira-token"
          type="password"
          placeholder="Paste your Atlassian API token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <span className="hint">
          Create one at id.atlassian.com → Security → API tokens. Stored in a private file only your
          user account can read, and only ever sent to Atlassian.
        </span>
      </div>
      <FormFoot canSubmit={canSubmit} onSubmit={submit} />
    </div>
  );
}

export function PylonForm() {
  const connect = useIssuesStore((s) => s.connectPylon);
  const connecting = useIssuesStore((s) => s.connecting);
  const [token, setToken] = useState("");

  const canSubmit = Boolean(token.trim());
  const submit = () => {
    if (canSubmit && !connecting) void connect(token.trim());
  };

  return (
    <div className="ig-form">
      <div className="field">
        <label htmlFor="pylon-token">API token</label>
        <input
          id="pylon-token"
          type="password"
          placeholder="Paste your Pylon API token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <span className="hint">
          Create one in Pylon → Settings → API tokens (Admin only). Stored in a private file only
          your user account can read, and only ever sent to Pylon.
        </span>
      </div>
      <FormFoot canSubmit={canSubmit} onSubmit={submit} />
    </div>
  );
}
