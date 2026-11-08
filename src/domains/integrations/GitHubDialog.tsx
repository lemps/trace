import { useState } from "react";
import { I } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { GitHubAccounts } from "@/domains/github/GitHubAccounts";
import { GitHubSignIn } from "@/domains/github/GitHubSignIn";
import { RepoBrowser } from "@/domains/github/RepoBrowser";
import { useGitHubStore } from "@/domains/github/store";
import { type GitHubStatus, SOURCE_LABEL } from "@/domains/github/types";
import { GITHUB } from "./github";

/** "ron875 · from gh", or "2 accounts · primary ron875" with several. */
function accountLine(s: GitHubStatus, login: string): string {
  if (s.accounts.length > 1) return `${s.accounts.length} accounts · primary ${login}`;
  return s.source ? `${login} · ${SOURCE_LABEL[s.source]}` : login;
}

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

// GitHub's details: sign trace in to one or more GitHub accounts with its own
// tokens, pick the primary (the one the repo browser uses), remove one, sign out of
// all of them (which deletes the tokens), and open the repo browser.
export function GitHubDialog({ onClose }: { onClose: () => void }) {
  const status = useGitHubStore((s) => s.status);
  const signOut = useGitHubStore((s) => s.signOut);
  const [browsing, setBrowsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);
  const login = status?.login;
  const accounts = status?.accounts ?? [];
  const working = Boolean(login) && !status?.problem;
  // With no account working, signing in is the only useful thing here.
  const mustSignIn = !accounts.some((a) => !a.problem);
  const signingIn = mustSignIn || adding;
  const tokens = accounts.length === 1 ? "token" : `${accounts.length} tokens`;

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
                <div className="ig-account">{accountLine(status, login)}</div>
                {working && <div className="gh-note">{tokenFacts(status)}</div>}
              </>
            )}
          </div>
        </div>
        {accounts.length === 0 ? (
          <GitHubSignIn />
        ) : (
          <div className="ig-sub">
            <h3>Accounts</h3>
            <div className="ig-note">
              Sandboxes clone and push each repo as the account that owns it.
            </div>
            <GitHubAccounts accounts={accounts} />
            {signingIn ? (
              <GitHubSignIn
                onSignedIn={() => setAdding(false)}
                onCancel={mustSignIn ? undefined : () => setAdding(false)}
              />
            ) : (
              <button type="button" className="btn" onClick={() => setAdding(true)}>
                <I.Plus size={13} /> Add another account
              </button>
            )}
          </div>
        )}
        {accounts.length > 0 && !adding && (
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
                  Sign out and delete {tokens}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => setConfirming(true)}>
                  {accounts.length > 1 ? "Sign out of everything" : "Sign out"}
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
