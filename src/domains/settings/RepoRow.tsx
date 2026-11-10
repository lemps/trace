import { useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { InlineConfirm } from "@/components/InlineConfirm";
import { SetupFields } from "@/domains/repos/SetupFields";
import { fullName, isEmptySetup, type RepoDetails, type SetupConfig } from "@/domains/repos/types";
import { setRepoSetup, suggestRepoSetup } from "@/ipc/repoSetup";
import { basename } from "@/platform/paths";
import { RepoAccountSelect } from "./RepoAccountSelect";

interface RepoRowProps {
  path: string;
  /** Null until loaded (it runs git per repo). */
  details: RepoDetails | null;
  onRemove: () => void;
  onSaved: (setup: SetupConfig) => void;
  /** The signed-in GitHub logins; the account picker shows with two or more. */
  githubLogins: string[];
  onAccountSaved: (login: string | null) => void;
}

const setupCount = (s: SetupConfig) => s.commands.length + s.copyFiles.length;

// One configured repo: name, where it's hosted, its folder, and its worktree
// setup — what runs after trace creates a worktree for an agent — and, with several
// GitHub accounts signed in, which one a sandbox uses for it.
export function RepoRow({
  path,
  details,
  onRemove,
  onSaved,
  githubLogins,
  onAccountSaved,
}: RepoRowProps) {
  const [editing, setEditing] = useState<SetupConfig | null>(null);
  const saved = details?.setup;
  const name = basename(path);

  const save = async () => {
    if (!editing) return;
    try {
      onSaved(await setRepoSetup(path, editing));
      setEditing(null);
    } catch (err) {
      toast.error(`Couldn't save ${name}'s setup: ${String(err)}`);
    }
  };
  const suggest = async () => {
    try {
      const s = await suggestRepoSetup(path);
      if (isEmptySetup(s)) toast.info(`Nothing to suggest for ${name}: no lockfiles found.`);
      else setEditing(s);
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div className="rp-item">
      <div className="repo-row">
        <I.Code size={14} />
        <span className="repo-name">{name}</span>
        {details?.remote && <span className="rp-remote">{fullName(details.remote)}</span>}
        <span className="repo-path">{path}</span>
        {details && githubLogins.length > 1 && (
          <RepoAccountSelect
            path={path}
            name={name}
            logins={githubLogins}
            value={details.githubAccount}
            onSaved={onAccountSaved}
          />
        )}
        <button
          type="button"
          className="btn xs rp-setup"
          disabled={!saved}
          aria-expanded={editing !== null}
          onClick={() => setEditing(editing ? null : (saved ?? null))}
        >
          {saved && !isEmptySetup(saved) ? `Setup · ${setupCount(saved)}` : "Setup"}
        </button>
        <InlineConfirm
          label={<I.X size={12} />}
          className="btn ghost icon xs repo-remove"
          ariaLabel={`Remove ${name}`}
          title={`Remove ${name}`}
          message="Remove from trace, with its ticket mappings? The folder stays."
          confirmLabel="Remove"
          onConfirm={onRemove}
        />
      </div>
      {editing && (
        <div className="rp-editor">
          <SetupFields setup={editing} onChange={setEditing} idPrefix={`rp-${name}`} />
          <div className="rp-editor-foot">
            <button type="button" className="btn" onClick={() => void suggest()}>
              Suggest from lockfiles
            </button>
            <span className="rp-spacer" />
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={() => void save()}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
