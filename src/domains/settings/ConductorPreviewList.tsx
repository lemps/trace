import type {
  ConductorPreview,
  ConductorWorkspace,
  ConductorWorkspaceStatus,
} from "@/ipc/conductorImport";
import { ConductorPrompts } from "./ConductorPrompts";
import { ConductorRepoRow } from "./ConductorRepoRow";
import { defaultLabel } from "./conductorDefaults";
import { canAdopt, type DefaultKey, type Ticks, toggled } from "./conductorSelection";

// Step 2 of the Conductor import: what's there, with a checkbox each. Repos
// show their translated setup; live workspaces their status; archived ones
// are listed folded and start unticked.

interface ConductorPreviewListProps {
  preview: ConductorPreview;
  ticks: Ticks;
  onChange: (ticks: Ticks) => void;
}

const STATUS: Record<ConductorWorkspaceStatus, { label: string; hint: string }> = {
  resumable: { label: "Resumable", hint: "Its conversation carries on in trace." },
  transcriptMissing: {
    label: "Transcript missing",
    hint: "Claude has deleted the conversation (after 30 days). The code moves over and the chat starts fresh.",
  },
  folderMissing: {
    label: "Folder missing",
    hint: "The worktree is gone, so there's nothing to move.",
  },
};

const DEFAULT_KEYS: DefaultKey[] = ["model", "permissionMode", "editor"];

export function ConductorPreviewList({ preview, ticks, onChange }: ConductorPreviewListProps) {
  const live = preview.workspaces.filter((w) => !w.archived);
  const archived = preview.workspaces.filter((w) => w.archived);
  const archivedOnDisk = archived.filter(canAdopt);
  const defaults = DEFAULT_KEYS.flatMap((key) => {
    const label = defaultLabel(key, preview.defaults);
    return label ? [{ key, label }] : [];
  });

  const workspaceRow = (ws: ConductorWorkspace) => (
    <WorkspaceRow
      key={ws.id}
      ws={ws}
      checked={ticks.workspaces.has(ws.id)}
      onToggle={(on) => onChange({ ...ticks, workspaces: toggled(ticks.workspaces, ws.id, on) })}
    />
  );

  return (
    <div className="ci-preview">
      <section className="ci-section">
        <div className="ci-label">Repositories</div>
        {preview.repos.length === 0 && (
          <div className="ci-empty">Conductor has no repositories.</div>
        )}
        {preview.repos.map((repo) => (
          <ConductorRepoRow
            key={repo.id}
            repo={repo}
            checked={ticks.repos.has(repo.id)}
            setup={ticks.setups[repo.id] ?? repo.setup}
            onToggle={(on) => onChange({ ...ticks, repos: toggled(ticks.repos, repo.id, on) })}
            onSetup={(setup) =>
              onChange({ ...ticks, setups: { ...ticks.setups, [repo.id]: setup } })
            }
          />
        ))}
      </section>

      <section className="ci-section">
        <div className="ci-label">Workspaces</div>
        <div className="ci-muted">
          Each one becomes a session. Its folder moves into the repo's .worktrees, keeping its
          branch and uncommitted work.
        </div>
        {live.length === 0 && <div className="ci-empty">Conductor has no live workspaces.</div>}
        {live.map(workspaceRow)}
        {archived.length > 0 && archivedOnDisk.length === 0 && (
          <div className="ci-muted">
            {archived.length} archived workspaces have no folder left, so they stay in Conductor.
          </div>
        )}
        {archivedOnDisk.length > 0 && (
          <details className="ci-archived">
            <summary>
              {archived.length} archived workspaces, skipped unless you tick them (
              {archivedOnDisk.length} still on disk)
            </summary>
            {archivedOnDisk.map(workspaceRow)}
          </details>
        )}
      </section>

      <ConductorPrompts preview={preview} ticks={ticks} onChange={onChange} />

      {defaults.length > 0 && (
        <section className="ci-section">
          <div className="ci-label">Defaults</div>
          {defaults.map(({ key, label }) => (
            <label key={key} className="ci-row">
              <input
                type="checkbox"
                checked={ticks.defaults.has(key)}
                onChange={(e) =>
                  onChange({ ...ticks, defaults: toggled(ticks.defaults, key, e.target.checked) })
                }
              />
              <span className="ci-row-title">{label}</span>
            </label>
          ))}
          {preview.defaults.editorUnknown && (
            <div className="ci-muted">
              Editor "{preview.defaults.editorUnknown}" isn't one trace opens, so it's left out.
            </div>
          )}
        </section>
      )}
    </div>
  );
}

interface WorkspaceRowProps {
  ws: ConductorWorkspace;
  checked: boolean;
  onToggle: (on: boolean) => void;
}

function WorkspaceRow({ ws, checked, onToggle }: WorkspaceRowProps) {
  const status = STATUS[ws.status];
  const adoptable = canAdopt(ws);
  return (
    <label className={adoptable ? "ci-row" : "ci-row off"}>
      <input
        type="checkbox"
        checked={adoptable && checked}
        disabled={!adoptable}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="ci-row-text">
        <span className="ci-row-title">
          <span className="ci-mono">
            {ws.repoName}/{ws.directoryName}
          </span>
          <span className={`ci-badge ${ws.status}`} title={status.hint}>
            {status.label}
          </span>
        </span>
        {ws.title && <span className="ci-row-sub">{ws.title}</span>}
        <span className="ci-row-sub ci-mono">
          {ws.branch ?? "no branch"}
          {ws.otherSessions > 0 && ` · ${ws.otherSessions} other chats not imported`}
        </span>
      </span>
    </label>
  );
}
