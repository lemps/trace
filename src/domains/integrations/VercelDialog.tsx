import { useEffect } from "react";
import { toast } from "@/app/toast";
import { InlineConfirm } from "@/components/InlineConfirm";
import { Modal } from "@/components/Modal";
import { useVercelStore } from "@/domains/vercel/store";
import { ClaudeLogin } from "./ClaudeLogin";
import { VercelForm } from "./ConnectForms";
import { SandboxLifetime } from "./SandboxLifetime";
import { SandboxSize } from "./SandboxSize";
import { VercelReadiness } from "./VercelReadiness";
import { VERCEL } from "./vercel";

// Vercel's details: connect with a token, then see whose it is (user, team and the
// project trace keeps its sandboxes in), what's still missing for a sandbox session
// (the checklist), pick the Claude login sandboxes get, and disconnect (which deletes
// the token).
export function VercelDialog({ onClose }: { onClose: () => void }) {
  const status = useVercelStore((s) => s.status);
  const disconnect = useVercelStore((s) => s.disconnect);
  const clearConnectError = useVercelStore((s) => s.clearConnectError);

  // Don't greet this dialog with the last attempt's failure.
  useEffect(() => clearConnectError(), [clearConnectError]);

  const confirmDisconnect = () => {
    disconnect().catch((err) => toast.error(`Couldn't disconnect Vercel: ${String(err)}`));
  };

  return (
    <Modal title={VERCEL.name} onClose={onClose}>
      <div className="ig-dialog">
        <div className="ig-dialog-head">
          <img className="ig-logo" src={VERCEL.logo} alt="" />
          <div className="ig-dialog-text">
            <div className="ig-desc">{VERCEL.description}</div>
            {status && (
              <div className="ig-account">
                {status.user} · team {status.team} · project {status.project}
              </div>
            )}
          </div>
        </div>
        {!status && <VercelForm />}
        <VercelReadiness vercel={status} />
        {status && <ClaudeLogin />}
        {status && <SandboxLifetime />}
        {status && <SandboxSize />}
        {status && (
          <div className="ig-form-foot">
            <InlineConfirm
              label="Disconnect"
              message="Disconnect Vercel and delete its token?"
              confirmLabel="Disconnect"
              onConfirm={confirmDisconnect}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
