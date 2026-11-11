import { useState } from "react";
import { toast } from "@/app/toast";
import { BusyLabel } from "@/components/BusyLabel";
import { SetupFields } from "@/domains/repos/SetupFields";
import { isEmptySetup, type SetupConfig } from "@/domains/repos/types";
import { setRepoSetup, suggestRepoSetup } from "@/ipc/repoSetup";
import { basename } from "@/platform/paths";

interface RepoSetupEditorProps {
  path: string;
  setup: SetupConfig;
  onChange: (setup: SetupConfig) => void;
  /** Saved: the setup as stored (cleaned). */
  onSaved: (setup: SetupConfig) => void;
  onCancel: () => void;
}

/** "Nothing to suggest", or the guess from the repo's lockfiles; throws on failure. */
export async function suggestSetup(path: string): Promise<SetupConfig | null> {
  const s = await suggestRepoSetup(path);
  if (!isEmptySetup(s)) return s;
  toast.info(`Nothing to suggest for ${basename(path)}: no lockfiles found.`);
  return null;
}

// A repo's worktree setup, edited in the list straight under its row: what runs
// after trace creates a worktree for an agent.
export function RepoSetupEditor({
  path,
  setup,
  onChange,
  onSaved,
  onCancel,
}: RepoSetupEditorProps) {
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const name = basename(path);

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await setRepoSetup(path, setup));
    } catch (err) {
      toast.error(`Couldn't save ${name}'s setup: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };
  const suggest = async () => {
    setSuggesting(true);
    try {
      const s = await suggestSetup(path);
      if (s) onChange(s);
    } catch (err) {
      toast.error(`Couldn't suggest a setup for ${name}: ${String(err)}`);
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="rs-band rs-editor">
      <SetupFields setup={setup} onChange={onChange} idPrefix={`rs-${name}`} />
      <div className="rs-editor-foot">
        <button
          type="button"
          className="btn"
          disabled={suggesting || saving}
          onClick={() => void suggest()}
        >
          <BusyLabel busy={suggesting} idle="Suggest from lockfiles" working="Suggesting…" />
        </button>
        <span className="rs-spacer" />
        <button type="button" className="btn" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
          <BusyLabel busy={saving} idle="Save" working="Saving…" />
        </button>
      </div>
    </div>
  );
}
