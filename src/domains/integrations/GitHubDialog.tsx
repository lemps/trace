import { useState } from "react";
import { I } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { GitHubSignIn } from "@/domains/github/GitHubSignIn";
import { RepoBrowser } from "@/domains/github/RepoBrowser";
import { useGitHubStore } from "@/domains/github/store";
import type { GitHubStatus } from "@/domains/github/types";
import { GITHUB } from "./github";

const SOURCE: Record<NonNullable<GitHubStatus["source"]>, string> = {
  pasted: "personal access token",
  gh: "token copied from gh",
  device: "signed in through the browser",
};

/** "repo, read:org · expires 2026-12-01", or what GitHub didn't say. */
function tokenFacts(s: GitHubStatus): string {
  const scopes =
    s.scopes === null
      ? "fine-grained (permissions not reported)"
      : s.scopes.length > 0
        ? `scopes: ${s.scopes.join(", ")}`
        : "no scopes";
  const expiry = s.expiresAt ? `expires ${s.expiresAt}` : "no expiry reported";
  return `${scopes} · ${expiry}`;
}

// GitHub's details: sign trace in with its own token, see whose it is, sign out
// (which deletes the token), and open the repo browser.
export function GitHubDialog({ onClose }: { onClose: () => void }) {
  const status = useGitHubStore((s) => s.status);
  const signOut = useGitHubStore((s) => s.signOut);
  const [browsing, setBrowsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const login = status?.login;
  const working = Boolean(login) && !status?.problem;

  if (browsing) return <RepoBrowser onClose={onClose} />;
  return (
    <Modal title={GITHUB.name} onClose={onClose}>
      <div className="ig-dialog">
        <div className="ig-dialog-head">
          <img className="ig-logo" src={GITHUB.logo} alt="" />
          <div className="ig-dialog-text">
            <div className="ig-desc">{GITHUB.description}</div>
            {login && status && (
              <>
                <div className="ig-account">
                  {login}
                  {status.source && ` · ${SOURCE[status.source]}`}
                </div>
                {working && <div className="gh-token-facts">{tokenFacts(status)}</div>}
              </>
            )}
          </div>
        </div>
        {!working && <GitHubSignIn />}
        {login && (
          <div className="ig-form-foot">
            {confirming ? (
              <>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => void signOut().then(() => setConfirming(false))}
                >
                  Sign out and delete token
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => setConfirming(true)}>
                  Sign out
                </button>
                {working && (
                  <button type="button" className="btn primary" onClick={() => setBrowsing(true)}>
                    <I.Download size={13} /> Browse repositories
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
