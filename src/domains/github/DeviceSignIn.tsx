import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { githubDeviceCancel, githubDeviceStart, githubDeviceWait } from "@/ipc/github";
import { useGitHubStore } from "./store";
import type { DeviceStart } from "./types";

// The OAuth device flow: show the code, open github.com/login/device, and wait
// (on the Rust side) until the user approves it there, which adds that account.
export function DeviceSignIn({ onCancel, onDone }: { onCancel: () => void; onDone?: () => void }) {
  const setStatus = useGitHubStore((s) => s.setStatus);
  const [start, setStart] = useState<DeviceStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read when the wait ends, so a new callback doesn't restart the flow.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const s = await githubDeviceStart();
        if (!live) return;
        setStart(s);
        const status = await githubDeviceWait();
        if (!live) return;
        setStatus(status);
        doneRef.current?.();
      } catch (err) {
        if (live) setError(String(err));
      }
    })();
    return () => {
      live = false;
      void githubDeviceCancel();
    };
  }, [setStatus]);

  const copy = (code: string) =>
    void navigator.clipboard.writeText(code).then(
      () => toast.success("Code copied"),
      () => toast.error("Couldn't copy the code")
    );

  return (
    <div className="gh-signin">
      {error && <div className="ig-error">{error}</div>}
      {!start && !error && <div className="gh-empty">Asking GitHub for a code…</div>}
      {start && !error && (
        <>
          <div className="ig-desc">
            Enter this code on GitHub, then approve trace. This page finishes by itself.
          </div>
          <div className="gh-device-code">
            <span className="gh-mono">{start.userCode}</span>
            <button
              type="button"
              className="btn icon"
              aria-label="Copy code"
              onClick={() => copy(start.userCode)}
            >
              <I.Copy size={13} />
            </button>
          </div>
        </>
      )}
      <div className="ig-form-foot">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        {start && !error && (
          <button
            type="button"
            className="btn primary"
            onClick={() => void openUrl(start.verificationUri)}
          >
            Open {start.verificationUri.replace(/^https:\/\//, "")}
          </button>
        )}
      </div>
    </div>
  );
}
