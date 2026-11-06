import type { SetupConfig } from "./types";

interface SetupFieldsProps {
  setup: SetupConfig;
  onChange: (setup: SetupConfig) => void;
  /** Distinguishes the fields' ids when several editors are on screen. */
  idPrefix: string;
}

const toLines = (items: string[]) => items.join("\n");
const fromLines = (text: string) => text.split("\n");

// The two halves of a repo's worktree setup, one per line each. Blank lines are
// dropped when it's saved (`SetupConfig::sanitized` in Rust).
export function SetupFields({ setup, onChange, idPrefix }: SetupFieldsProps) {
  return (
    <div className="rp-setup">
      <div className="field">
        <label htmlFor={`${idPrefix}-commands`}>Commands</label>
        <textarea
          id={`${idPrefix}-commands`}
          className="rp-lines"
          spellCheck={false}
          rows={3}
          placeholder="npm install"
          value={toLines(setup.commands)}
          onChange={(e) => onChange({ ...setup, commands: fromLines(e.target.value) })}
        />
        <span className="hint">
          One per line, run in order in each new worktree. A failure stops the rest and shows its
          output.
        </span>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-copy`}>Copy from the main checkout</label>
        <textarea
          id={`${idPrefix}-copy`}
          className="rp-lines"
          spellCheck={false}
          rows={2}
          placeholder=".env"
          value={toLines(setup.copyFiles)}
          onChange={(e) => onChange({ ...setup, copyFiles: fromLines(e.target.value) })}
        />
        <span className="hint">
          Untracked files a worktree doesn't get, like .env. Paths are relative to the repo.
        </span>
      </div>
    </div>
  );
}
