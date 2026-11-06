import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { Modal } from "@/components/Modal";
import { JiraForm, PylonForm } from "@/domains/issues/components/ProviderLogin";
import { useIssuesStore } from "@/domains/issues/store";
import type { ProviderKind } from "@/domains/issues/types";

const LABEL: Record<ProviderKind, string> = { jira: "Jira", pylon: "Pylon" };

function IntegrationCard({ kind, onConnect }: { kind: ProviderKind; onConnect: () => void }) {
  const session = useIssuesStore((s) => s.sessions[kind]);
  const user = useIssuesStore((s) => s.users[kind]);
  const disconnect = useIssuesStore((s) => s.disconnect);
  const [confirming, setConfirming] = useState(false);

  const confirmDisconnect = () => {
    setConfirming(false);
    disconnect(kind).catch((err) => toast.error(`Couldn't disconnect ${LABEL[kind]}: ${err}`));
  };

  return (
    <div className="integration-card">
      <div className="ig-ic ig-ic-jira">{LABEL[kind][0]}</div>
      <div className="ig-body">
        <div className="ig-name">
          {LABEL[kind]}
          {session && user ? ` · ${user.displayName}` : ""}
        </div>
        <div className="ig-sub">
          {session
            ? kind === "pylon"
              ? "api.usepylon.com"
              : `${session.site} · ${session.email}`
            : "Not connected."}
        </div>
      </div>
      <div className="ig-actions">
        {!session && (
          <button type="button" className="btn" onClick={onConnect}>
            Connect
          </button>
        )}
        {session && !confirming && (
          <>
            <span className="ig-status connected">Connected</span>
            <button type="button" className="btn" onClick={() => setConfirming(true)}>
              Disconnect
            </button>
          </>
        )}
        {session && confirming && (
          <>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="btn danger" onClick={confirmDisconnect}>
              Disconnect {LABEL[kind]}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// The issue trackers behind the board. Each connects independently, and none is required.
export function IntegrationSettings() {
  const sessions = useIssuesStore((s) => s.sessions);
  const [connecting, setConnecting] = useState<ProviderKind | null>(null);

  // Close the connect modal once its provider is live.
  useEffect(() => {
    if (connecting && sessions[connecting]) setConnecting(null);
  }, [connecting, sessions]);

  return (
    <section className="setting-group">
      <h2>Integrations</h2>
      <div className="desc">Where the board comes from. Connect either, both or neither.</div>
      <IntegrationCard kind="jira" onConnect={() => setConnecting("jira")} />
      <IntegrationCard kind="pylon" onConnect={() => setConnecting("pylon")} />
      {connecting && (
        <Modal title={`Connect ${LABEL[connecting]}`} onClose={() => setConnecting(null)}>
          {connecting === "jira" ? <JiraForm /> : <PylonForm />}
        </Modal>
      )}
    </section>
  );
}
