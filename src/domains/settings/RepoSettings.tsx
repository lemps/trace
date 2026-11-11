import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { InlineConfirm } from "@/components/InlineConfirm";
import { CloneFolder } from "@/domains/github/CloneFolder";
import { RepoBrowser } from "@/domains/github/RepoBrowser";
import { useGitHubStore } from "@/domains/github/store";
import type { RepoDetails } from "@/domains/repos/types";
import { repoDetails } from "@/ipc/repoSetup";
import {
  addRepo,
  listRepoMappings,
  listRepos,
  type RepoMapping,
  removeRepo,
  setRepoMappings,
} from "@/ipc/repos";
import { basename } from "@/platform/paths";
import { ConductorImport } from "./ConductorImport";
import { REPO_ACCOUNT_HINT } from "./RepoAccountSelect";
import { RepoRow } from "./RepoRow";

// The Repositories section: the configured repos plus the ticket→repo mapping
// table. A ticket whose key contains a mapping's pattern (case-insensitive)
// resolves to that repo; first match wins. Incomplete rows (empty pattern)
// live only in the editor — the backend drops them from disk until filled in.
type EditorRow = RepoMapping & { id: string };

const withId = (m: RepoMapping): EditorRow => ({ ...m, id: crypto.randomUUID() });

export function RepoSettings() {
  const [repos, setRepos] = useState<string[]>([]);
  const [mappings, setMappings] = useState<EditorRow[]>([]);
  // Remote, default branch and setup per repo: slower (git per repo), so they fill in.
  const [details, setDetails] = useState<Record<string, RepoDetails>>({});
  const [browsing, setBrowsing] = useState(false);
  const github = useGitHubStore((s) => s.status);
  const checkGitHub = useGitHubStore((s) => s.checkStatus);
  const githubLogins = (github?.accounts ?? []).map((a) => a.login);

  useEffect(() => {
    if (!github) void checkGitHub();
  }, [github, checkGitHub]);

  const loadDetails = useCallback(
    () =>
      void repoDetails()
        .then((list) => setDetails(Object.fromEntries(list.map((d) => [d.path, d]))))
        .catch((err) => toast.error(`Couldn't read your repositories: ${String(err)}`)),
    []
  );

  useEffect(() => {
    listRepos()
      .then(setRepos)
      .catch((err) => toast.error(`Couldn't load your repositories: ${String(err)}`));
    loadDetails();
    listRepoMappings()
      .then((list) => setMappings(list.map(withId)))
      .catch((err) => toast.error(`Couldn't load your repo mappings: ${String(err)}`));
  }, [loadDetails]);

  const persist = (next: EditorRow[]) => {
    setMappings(next);
    void setRepoMappings(next.map(({ pattern, repo }) => ({ pattern, repo }))).catch((err) =>
      toast.error(`Couldn't save your repo mappings: ${String(err)}`)
    );
  };

  const addFolder = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose a git repository",
    });
    if (typeof picked !== "string") return;
    try {
      setRepos(await addRepo(picked));
      loadDetails();
    } catch (err) {
      toast.error(`Couldn't add that repository: ${String(err)}`);
    }
  };

  const remove = async (path: string) => {
    try {
      setRepos(await removeRepo(path));
      persist(mappings.filter((m) => m.repo !== path));
    } catch (err) {
      toast.error(`Couldn't remove that repository: ${String(err)}`);
    }
  };

  return (
    <section className="setting-group">
      <h2>Repositories</h2>
      <div className="desc">
        The git repos your tickets live in. Agents run in isolated worktrees under the resolved
        repo.
      </div>
      {repos.length > 0 && (
        <div className="repo-list">
          {repos.map((path) => (
            <RepoRow
              key={path}
              path={path}
              details={details[path] ?? null}
              onRemove={() => void remove(path)}
              onSaved={(setup) => {
                const d = details[path];
                if (d) setDetails({ ...details, [path]: { ...d, setup } });
              }}
              githubLogins={githubLogins}
              onAccountSaved={(githubAccount) =>
                setDetails((all) => {
                  const d = all[path];
                  return d ? { ...all, [path]: { ...d, githubAccount } } : all;
                })
              }
            />
          ))}
        </div>
      )}
      {repos.length > 0 && githubLogins.length > 1 && (
        <span className="hint rp-account-hint">GitHub account: {REPO_ACCOUNT_HINT}</span>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button type="button" className="btn" onClick={addFolder}>
          <I.Plus size={14} /> Add repository…
        </button>
        <button type="button" className="btn" onClick={() => setBrowsing(true)}>
          <I.Download size={14} /> Clone from GitHub…
        </button>
        <ConductorImport
          onImported={() => {
            void listRepos().then(setRepos);
            loadDetails();
          }}
        />
      </div>
      {repos.length === 0 && (
        <span className="hint" style={{ marginTop: 8, display: "block" }}>
          Add the folder of a local git repository, or clone one from GitHub.
        </span>
      )}
      <CloneFolder label="GitHub clones go in" />
      {browsing && (
        <RepoBrowser
          onClose={() => {
            setBrowsing(false);
            loadDetails();
          }}
          onCloned={(cloned) => {
            setRepos((list) => (list.includes(cloned.path) ? list : [...list, cloned.path]));
            loadDetails();
          }}
        />
      )}

      {repos.length > 1 && (
        <div className="setting-block">
          <div className="label">Ticket mapping</div>
          <div className="hint">
            Tickets whose key contains the pattern use that repository (first match wins). Tickets
            with no match ask once and remember the answer per ticket.
          </div>
          {mappings.map((m, i) => (
            <div key={m.id} className="map-row">
              <input
                type="text"
                aria-label="Ticket pattern"
                placeholder="e.g. TRACE"
                value={m.pattern}
                onChange={(e) =>
                  persist(mappings.map((x, j) => (j === i ? { ...x, pattern: e.target.value } : x)))
                }
              />
              <span className="map-arrow">→</span>
              <select
                aria-label="Mapped repository"
                value={m.repo}
                onChange={(e) =>
                  persist(mappings.map((x, j) => (j === i ? { ...x, repo: e.target.value } : x)))
                }
              >
                {repos.map((r) => (
                  <option key={r} value={r}>
                    {basename(r)}
                  </option>
                ))}
              </select>
              {m.pattern.trim() ? (
                <InlineConfirm
                  label={<I.Trash size={12} />}
                  className="btn ghost icon xs repo-remove"
                  size="xs"
                  ariaLabel="Remove mapping"
                  message={`Remove the ${m.pattern.trim()} mapping?`}
                  confirmLabel="Remove"
                  onConfirm={() => persist(mappings.filter((x) => x.id !== m.id))}
                />
              ) : (
                // A blank row holds nothing yet (it isn't even saved), so it goes on one click.
                <IconButton
                  size="xs"
                  className="ghost repo-remove"
                  onClick={() => persist(mappings.filter((x) => x.id !== m.id))}
                  label="Remove mapping"
                >
                  <I.Trash size={12} />
                </IconButton>
              )}
            </div>
          ))}
          <button
            type="button"
            className="sec-add"
            onClick={() => persist([...mappings, withId({ pattern: "", repo: repos[0] ?? "" })])}
          >
            <I.Plus size={12} /> Add mapping
          </button>
        </div>
      )}
    </section>
  );
}
