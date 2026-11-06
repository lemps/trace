import { I } from "@/components/Icon";
import { relTime } from "@/domains/prs/relTime";
import type { GhRepo } from "./types";

interface RepoRowProps {
  repo: GhRepo;
  cloning: boolean;
  /** Another clone is running; one at a time keeps errors attributable. */
  busy: boolean;
  onClone: () => void;
}

// One GitHub repo: name, flags, description, and Clone — or where it's checked out.
export function RepoRow({ repo, cloning, busy, onClone }: RepoRowProps) {
  const meta = [repo.language, repo.updatedAt && `updated ${relTime(repo.updatedAt)}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="gh-row">
      <div className="gh-row-main">
        <div className="gh-row-title">
          <span className="gh-row-name">{repo.name}</span>
          {repo.isPrivate && <span className="gh-flag">Private</span>}
          {repo.isFork && <span className="gh-flag">Fork</span>}
          {repo.isArchived && <span className="gh-flag">Archived</span>}
        </div>
        {repo.description && <div className="gh-row-desc">{repo.description}</div>}
        {meta && <div className="gh-row-meta">{meta}</div>}
      </div>
      {repo.localPath ? (
        <span className="gh-row-local" title={repo.localPath}>
          <I.Check size={13} /> In trace
        </span>
      ) : (
        <button type="button" className="btn" disabled={busy} onClick={onClone}>
          <I.Download size={13} /> {cloning ? "Cloning…" : "Clone"}
        </button>
      )}
    </div>
  );
}
