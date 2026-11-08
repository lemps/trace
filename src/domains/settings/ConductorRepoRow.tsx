import { useState } from "react";
import { SetupFields } from "@/domains/repos/SetupFields";
import { isEmptySetup, type SetupConfig } from "@/domains/repos/types";
import type { ConductorRepo } from "@/ipc/conductorImport";

// One Conductor repo in the import preview: a checkbox, its folder, its setup
// as trace will run it (editable), and what doesn't come over.

interface ConductorRepoRowProps {
  repo: ConductorRepo;
  checked: boolean;
  /** The setup to import: as translated, or as edited here. */
  setup: SetupConfig;
  onToggle: (on: boolean) => void;
  onSetup: (setup: SetupConfig) => void;
}

function setupSummary(setup: SetupConfig): string {
  const parts = [...setup.commands.filter((c) => c.trim())];
  const copies = setup.copyFiles.filter((f) => f.trim());
  if (copies.length > 0) parts.push(`copies ${copies.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : "No setup";
}

export function ConductorRepoRow({
  repo,
  checked,
  setup,
  onToggle,
  onSetup,
}: ConductorRepoRowProps) {
  const [editing, setEditing] = useState(false);
  const status = !repo.exists
    ? "Not on this computer"
    : repo.alreadyAdded
      ? "Already in trace"
      : null;
  return (
    <div className="ci-repo">
      <div className="ci-repo-head">
        <label className={repo.exists ? "ci-row" : "ci-row off"}>
          <input
            type="checkbox"
            checked={repo.exists && checked}
            disabled={!repo.exists}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="ci-row-text">
            <span className="ci-row-title">
              {repo.name}
              {status && <span className="ci-badge">{status}</span>}
            </span>
            <span className="ci-row-sub ci-mono">{repo.rootPath}</span>
            <span className="ci-row-sub ci-mono" title="What runs in each new worktree">
              {setupSummary(setup)}
            </span>
          </span>
        </label>
        {repo.exists && (
          <button
            type="button"
            className="rp-setup-toggle"
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Done" : isEmptySetup(setup) ? "Add setup" : "Edit setup"}
          </button>
        )}
      </div>
      {editing && (
        <div className="ci-setup">
          <SetupFields setup={setup} onChange={onSetup} idPrefix={`ci-${repo.id}`} />
          {repo.alreadyAdded && (
            <span className="hint">
              If trace already has a setup for this repo, it's kept and this one isn't used.
            </span>
          )}
        </div>
      )}
      {[...repo.notes, ...repo.notImported].map((line) => (
        <div key={line} className="ci-row-note">
          {line}
        </div>
      ))}
    </div>
  );
}
