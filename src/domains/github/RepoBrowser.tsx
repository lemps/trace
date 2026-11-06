import { useEffect, useMemo, useState } from "react";
import { toast } from "@/app/toast";
import { Modal } from "@/components/Modal";
import { githubClone } from "@/ipc/github";
import { CloneFolder } from "./CloneFolder";
import { CloneSetup } from "./CloneSetup";
import { GitHubSignIn } from "./GitHubSignIn";
import { RepoRow } from "./RepoRow";
import { useGitHubStore } from "./store";
import type { Cloned, GhRepo } from "./types";

interface RepoBrowserProps {
  onClose: () => void;
  /** A repo was cloned and added to trace's repositories. */
  onCloned?: (cloned: Cloned) => void;
}

const matches = (repo: GhRepo, q: string) =>
  repo.fullName.toLowerCase().includes(q) || (repo.description ?? "").toLowerCase().includes(q);

// Browse the signed-in user's (and their orgs') GitHub repos and check one out:
// clone it into the clone folder, add it to Settings → Repositories, then offer
// its worktree setup.
export function RepoBrowser({ onClose, onCloned }: RepoBrowserProps) {
  const status = useGitHubStore((s) => s.status);
  const owners = useGitHubStore((s) => s.owners);
  const repos = useGitHubStore((s) => s.repos);
  const loadingOwner = useGitHubStore((s) => s.loadingOwner);
  const error = useGitHubStore((s) => s.error);
  const { checkStatus, loadOwners, loadRepos, markLocal } = useGitHubStore.getState();
  const login = status?.login ?? null;
  const [owner, setOwner] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cloning, setCloning] = useState<string | null>(null);
  const [cloned, setCloned] = useState<Cloned | null>(null);
  const current = owner ?? login;

  useEffect(() => {
    if (!status) void checkStatus();
  }, [status, checkStatus]);
  useEffect(() => {
    if (login) void loadOwners();
  }, [login, loadOwners]);
  useEffect(() => {
    if (current) void loadRepos(current);
  }, [current, loadRepos]);

  const list = current ? repos[current] : undefined;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).filter((r) => !q || matches(r, q));
  }, [list, query]);

  const clone = async (repo: GhRepo) => {
    setCloning(repo.fullName);
    try {
      const done = await githubClone(repo.fullName);
      markLocal(repo.fullName, done.path);
      onCloned?.(done);
      setCloned(done);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCloning(null);
    }
  };

  const body = () => {
    if (!login) return status ? <GitHubSignIn /> : <div className="gh-empty">Checking gh…</div>;
    if (cloned) return <CloneSetup cloned={cloned} onDone={onClose} />;
    return (
      <>
        <div className="gh-toolbar">
          {owners.length > 1 && (
            <select
              aria-label="Owner"
              value={current ?? ""}
              onChange={(e) => setOwner(e.target.value)}
            >
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
          <input
            type="search"
            aria-label="Search repositories"
            placeholder="Search repositories"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <CloneFolder />
        {error && <div className="ig-error">{error}</div>}
        <div className="gh-list">
          {!list && loadingOwner === current && (
            <div className="gh-empty">Loading repositories…</div>
          )}
          {list && shown.length === 0 && (
            <div className="gh-empty">
              {query ? `No repositories match “${query}”.` : `${current} has no repositories.`}
            </div>
          )}
          {shown.map((r) => (
            <RepoRow
              key={r.fullName}
              repo={r}
              cloning={cloning === r.fullName}
              busy={cloning !== null}
              onClone={() => void clone(r)}
            />
          ))}
        </div>
      </>
    );
  };

  return (
    <Modal title="Clone from GitHub" onClose={onClose} className="gh-modal">
      {body()}
    </Modal>
  );
}
