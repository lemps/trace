import { useState } from "react";
import { BusyLabel } from "@/components/BusyLabel";
import { I } from "@/components/Icon";
import { DeviceSignIn } from "./DeviceSignIn";
import { useGitHubStore } from "./store";

interface GitHubSignInProps {
  /** An account was added (or its token renewed). */
  onSignedIn?: () => void;
  /** Shown as a Cancel button when adding another account. */
  onCancel?: () => void;
}

// Signing trace in to GitHub with its own tokens, kept in a private file in
// trace's config dir: through the browser (OAuth device flow, when this build has
// an OAuth app), a one-off copy of every gh CLI login, or a pasted personal
// access token. Each adds an account (or renews that account's token). Nothing here
// sees a token after it's submitted.
export function GitHubSignIn({ onSignedIn, onCancel }: GitHubSignInProps) {
  const status = useGitHubStore((s) => s.status);
  const signingIn = useGitHubStore((s) => s.signingIn);
  const error = useGitHubStore((s) => s.signInError);
  const { signInToken, importGh } = useGitHubStore.getState();
  const [token, setToken] = useState("");
  const [device, setDevice] = useState(false);

  if (device) return <DeviceSignIn onCancel={() => setDevice(false)} onDone={onSignedIn} />;
  const deviceFlow = status?.deviceFlow ?? false;
  const canSubmit = Boolean(token.trim()) && !signingIn;
  const done = (ok: boolean) => {
    if (!ok) return;
    setToken("");
    onSignedIn?.();
  };
  const submit = () => {
    if (canSubmit) void signInToken(token.trim()).then(done);
  };
  // With accounts signed in, each one's problem shows on its own row instead.
  const problem = status?.accounts.length ? null : status?.problem;

  return (
    <div className="gh-signin">
      {problem && <div className="ig-error">{problem}</div>}
      {(deviceFlow || status?.ghAvailable) && (
        <div className="gh-signin-options">
          {deviceFlow && (
            <button type="button" className="btn primary" onClick={() => setDevice(true)}>
              <I.GitHub size={14} /> Sign in with GitHub
            </button>
          )}
          {status?.ghAvailable && (
            <button
              type="button"
              className="btn"
              disabled={signingIn}
              onClick={() => void importGh().then(done)}
            >
              <I.Terminal size={14} /> Use my gh logins
            </button>
          )}
        </div>
      )}
      {status?.ghAvailable && (
        <div className="gh-note">
          Use my gh logins copies the token of every account the GitHub CLI is signed in to, once;
          trace doesn't need gh after that.
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
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className={deviceFlow ? "btn" : "btn primary"}
          disabled={!canSubmit}
          onClick={submit}
        >
          <I.Key size={14} />{" "}
          <BusyLabel busy={signingIn} idle="Sign in with token" working="Checking…" />
        </button>
      </div>
    </div>
  );
}
