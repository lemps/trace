import { toast } from "@/app/toast";
import { setRepoGitHubAccount } from "@/ipc/repoSetup";

export const REPO_ACCOUNT_HINT =
  "Which account a Vercel Sandbox clones and pushes as. Automatic uses the repo's SSH alias, its owner, or whichever account can push.";

interface RepoAccountSelectProps {
  path: string;
  name: string;
  /** The signed-in GitHub logins. */
  logins: string[];
  /** The account set for this repo; null is automatic. */
  value: string | null;
  onSaved: (login: string | null) => void;
}

// A repo's GitHub account: Automatic, or one of the signed-in accounts. Only shown
// with two or more accounts, when there's a choice to make.
export function RepoAccountSelect({ path, name, logins, value, onSaved }: RepoAccountSelectProps) {
  // A saved account that's since been signed out still shows as what's set.
  const options = value && !logins.includes(value) ? [...logins, value] : logins;
  const change = (raw: string) => {
    const login = raw === "" ? null : raw;
    setRepoGitHubAccount(path, login)
      .then(() => onSaved(login))
      .catch((err) => toast.error(`Couldn't set ${name}'s GitHub account: ${String(err)}`));
  };

  return (
    <label className="rp-account-field" title={REPO_ACCOUNT_HINT}>
      <span className="rp-account-label">GitHub account</span>
      <select
        className="rp-account"
        aria-label={`GitHub account for ${name}`}
        value={value ?? ""}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Automatic</option>
        {options.map((login) => (
          <option key={login} value={login}>
            {logins.includes(login) ? login : `${login} (signed out)`}
          </option>
        ))}
      </select>
    </label>
  );
}
