import { useState } from "react";
import { toast } from "@/app/toast";
import { useGitHubStore } from "./store";
import { type GitHubAccount, SOURCE_LABEL } from "./types";

// The signed-in GitHub accounts, the primary first: how each was added, whether
// its token works, and actions to make one primary or remove it (confirmed inline).
export function GitHubAccounts({ accounts }: { accounts: GitHubAccount[] }) {
  const { removeAccount, setPrimary } = useGitHubStore.getState();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const run = (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    action()
      .catch((err) => toast.error(`${failure}: ${String(err)}`))
      .finally(() => {
        setBusy(false);
        setConfirming(null);
      });
  };

  return (
    <ul className="gh-accounts">
      {accounts.map((a) => (
        <li key={a.login} className="gh-account">
          <div className="gh-account-main">
            <div className="gh-row-title">
              <span className="gh-account-login">{a.login}</span>
              {a.primary && <span className="gh-flag">Primary</span>}
            </div>
            <div className="gh-row-meta">{SOURCE_LABEL[a.source]}</div>
            {a.problem && <div className="ig-error">{a.problem}</div>}
          </div>
          {confirming === a.login ? (
            <>
              <button type="button" className="btn" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={busy}
                onClick={() => run(() => removeAccount(a.login), `Couldn't remove ${a.login}`)}
              >
                Remove {a.login}
              </button>
            </>
          ) : (
            <>
              {!a.primary && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => run(() => setPrimary(a.login), `Couldn't make ${a.login} primary`)}
                >
                  Make primary
                </button>
              )}
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setConfirming(a.login)}
              >
                Remove
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
