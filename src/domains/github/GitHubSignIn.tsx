import { useState } from "react";
import { I } from "@/components/Icon";
import { DeviceSignIn } from "./DeviceSignIn";
import { useGitHubStore } from "./store";

// Signing trace in to GitHub with its own token, kept in a private file in
// trace's config dir: through the browser (OAuth device flow, when this build has
// an OAuth app), a one-off copy of the gh CLI's login, or a pasted personal
// access token. Nothing here sees the token after it's submitted.
export function GitHubSignIn() {
  const status = useGitHubStore((s) => s.status);
  const signingIn = useGitHubStore((s) => s.signingIn);
  const error = useGitHubStore((s) => s.signInError);
  const { signInToken, importGh } = useGitHubStore.getState();
  const [token, setToken] = useState("");
  const [device, setDevice] = useState(false);

  if (device) return <DeviceSignIn onCancel={() => setDevice(false)} />;
  const deviceFlow = status?.deviceFlow ?? false;
  const canSubmit = Boolean(token.trim()) && !signingIn;
  const submit = () => {
    if (canSubmit) void signInToken(token.trim());
  };

  return (
    <div className="gh-signin">
      {status?.problem && <div className="ig-error">{status.problem}</div>}
      {(deviceFlow || status?.ghAvailable) && (
        <div className="gh-signin-options">
          {deviceFlow && (
            <button type="button" className="btn primary" onClick={() => setDevice(true)}>
              <I.Plug size={13} /> Sign in with GitHub
            </button>
          )}
          {status?.ghAvailable && (
            <button
              type="button"
              className="btn"
              disabled={signingIn}
              onClick={() => void importGh()}
            >
              <I.Terminal size={13} /> Use my gh login
            </button>
          )}
        </div>
      )}
      {status?.ghAvailable && (
        <div className="gh-note">
          Use my gh login copies the GitHub CLI's token once; trace doesn't need gh after that.
        </div>
      )}
      <div className="field">
        <label htmlFor="gh-token">Personal access token</label>
        <input
          id="gh-token"
          type="password"
          autoComplete="off"
          placeholder="github_pat_… or ghp_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <span className="hint">
          Create one at github.com → Settings → Developer settings → Personal access tokens. A
          fine-grained token needs Contents: read on the repos you want; a classic one, the{" "}
          <span className="gh-mono">repo</span> and <span className="gh-mono">read:org</span>{" "}
          scopes. Stored in a private file only your user account can read, and only ever sent to
          GitHub.
        </span>
      </div>
      {error && <div className="ig-error">{error}</div>}
      <div className="ig-form-foot">
        <button
          type="button"
          className={deviceFlow ? "btn" : "btn primary"}
          disabled={!canSubmit}
          onClick={submit}
        >
          <I.Bolt size={13} /> {signingIn ? "Checking…" : "Sign in with token"}
        </button>
      </div>
    </div>
  );
}
