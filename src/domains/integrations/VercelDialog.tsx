import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { Modal } from "@/components/Modal";
import { useVercelStore } from "@/domains/vercel/store";
import { ClaudeLogin } from "./ClaudeLogin";
import { VercelForm } from "./ConnectForms";
import { VERCEL } from "./vercel";

// Vercel's details: connect with a token, then see whose it is (user, team and the
// project trace keeps its sandboxes in), pick the Claude login sandboxes get, and
// disconnect (which deletes the token).
export function VercelDialog({ onClose }: { onClose: () => void }) {
  const status = useVercelStore((s) => s.status);
  const disconnect = useVercelStore((s) => s.disconnect);
  const clearConnectError = useVercelStore((s) => s.clearConnectError);
  const [confirming, setConfirming] = useState(false);

  // Don't greet this dialog with the last attempt's failure.
  useEffect(() => clearConnectError(), [clearConnectError]);

  const confirmDisconnect = () => {
    disconnect()
      .then(() => setConfirming(false))
      .catch((err) => toast.error(`Couldn't disconnect Vercel: ${String(err)}`));
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
        {status && <ClaudeLogin />}
        {status && (
          <div className="ig-form-foot">
            {confirming ? (
              <>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button type="button" className="btn danger" onClick={confirmDisconnect}>
                  Disconnect Vercel and delete its token
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirming(true)}>
                Disconnect
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
