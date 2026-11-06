import { useState } from "react";
import { toast } from "@/app/toast";
import { SetupFields } from "@/domains/repos/SetupFields";
import { isEmptySetup } from "@/domains/repos/types";
import { setRepoSetup } from "@/ipc/repoSetup";
import type { Cloned } from "./types";

interface CloneSetupProps {
  cloned: Cloned;
  onDone: () => void;
}

// After a clone: where it went, and the worktree setup to save for it — prefilled
// from what was saved for this repo before, or from its lockfiles.
export function CloneSetup({ cloned, onDone }: CloneSetupProps) {
  const [setup, setSetup] = useState(cloned.suggestedSetup);
  const [saving, setSaving] = useState(false);
  const name = cloned.remote.name;

  const save = async () => {
    setSaving(true);
    try {
      await setRepoSetup(cloned.path, setup);
      toast.success(`${name} is ready for agents.`);
      onDone();
    } catch (err) {
      toast.error(`Couldn't save ${name}'s setup: ${String(err)}`);
      setSaving(false);
    }
  };

  return (
    <div className="gh-setup">
      <div className="gh-setup-head">
        <div className="gh-setup-title">
          {cloned.alreadyPresent ? `${name} was already checked out` : `Cloned ${name}`}
        </div>
        <div className="gh-setup-facts">
          <span className="gh-mono">{cloned.path}</span>
          <span>
            default branch <span className="gh-mono">{cloned.defaultBranch}</span>
          </span>
        </div>
        <div className="ig-desc">
          It's in your repositories now. Agents work in their own worktree of it; set up what each
          new worktree needs below
          {isEmptySetup(cloned.suggestedSetup) ? "." : " (suggested from the repo)."}
        </div>
      </div>
      <SetupFields setup={setup} onChange={setSetup} idPrefix="gh-setup" />
      <div className="ig-form-foot">
        <button type="button" className="btn" onClick={onDone} disabled={saving}>
          Skip
        </button>
        <button type="button" className="btn primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save setup"}
        </button>
      </div>
    </div>
  );
}
