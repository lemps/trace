import { useState } from "react";
import { I } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { GitHubSignIn } from "@/domains/github/GitHubSignIn";
import { RepoBrowser } from "@/domains/github/RepoBrowser";
import { useGitHubStore } from "@/domains/github/store";
import { GITHUB } from "./github";

// GitHub's details. Unlike the trackers it has no form: trace uses the gh CLI's
// sign-in, so this shows who that is and opens the repo browser.
export function GitHubDialog({ onClose }: { onClose: () => void }) {
  const status = useGitHubStore((s) => s.status);
  const [browsing, setBrowsing] = useState(false);
  const login = status?.login;

  if (browsing) return <RepoBrowser onClose={onClose} />;
  return (
    <Modal title={GITHUB.name} onClose={onClose}>
      <div className="ig-dialog">
        <div className="ig-dialog-head">
          <img className="ig-logo" src={GITHUB.logo} alt="" />
          <div className="ig-dialog-text">
            <div className="ig-desc">{GITHUB.description}</div>
            {login && (
              <div className="ig-account">
                {login} · signed in with the GitHub CLI
                {(status?.accounts.length ?? 0) > 1 &&
                  ` (+${(status?.accounts.length ?? 1) - 1} more)`}
              </div>
            )}
          </div>
        </div>
        {login ? (
          <>
            <div className="ig-desc">
              To sign out or switch accounts, use <span className="kbd">gh auth logout</span> or{" "}
              <span className="kbd">gh auth switch</span> in a terminal.
            </div>
            <div className="ig-form-foot">
              <button type="button" className="btn primary" onClick={() => setBrowsing(true)}>
                <I.Download size={13} /> Browse repositories
              </button>
            </div>
          </>
        ) : (
          <GitHubSignIn />
        )}
      </div>
    </Modal>
  );
}
