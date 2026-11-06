import { I } from "@/components/Icon";
import { useGitHubStore } from "./store";

// What to do when `gh` is missing or signed out. trace never asks for a GitHub
// token: the user signs in with gh itself, then checks again here.
export function GitHubSignIn() {
  const status = useGitHubStore((s) => s.status);
  const checking = useGitHubStore((s) => s.checking);
  const checkStatus = useGitHubStore((s) => s.checkStatus);

  const installed = status?.installed ?? false;
  return (
    <div className="gh-signin">
      {status?.problem && <div className="ig-error">{status.problem}</div>}
      <ol className="gh-steps">
        {!installed && (
          <li>
            Install the GitHub CLI from <span className="gh-mono">cli.github.com</span>.
          </li>
        )}
        <li>
          In a terminal, run <span className="kbd">gh auth login</span> and sign in.
        </li>
        <li>Check again here. trace uses gh's sign-in and never stores a GitHub token.</li>
      </ol>
      <div className="ig-form-foot">
        <button
          type="button"
          className="btn primary"
          disabled={checking}
          onClick={() => void checkStatus()}
        >
          <I.Refresh size={13} /> {checking ? "Checking…" : "Check again"}
        </button>
      </div>
    </div>
  );
}
