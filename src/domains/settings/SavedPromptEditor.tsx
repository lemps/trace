import { useState } from "react";
import { toast } from "@/app/toast";
import { useSavedPrompts } from "@/domains/savedPrompts/store";
import type { SavedPromptDraft } from "@/ipc/savedPrompts";

interface SavedPromptEditorProps {
  /** The prompt being edited; one with no id is a new one. */
  initial: SavedPromptDraft;
  onDone: () => void;
}

// Adding or editing one saved prompt: its /name, its title and its text. The
// backend checks the name (a slug, not taken) and says why it won't save.
export function SavedPromptEditor({ initial, onDone }: SavedPromptEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const idPrefix = `sp-${initial.id ?? "new"}`;
  const canSave = draft.name.trim() !== "" && draft.body.trim() !== "" && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await useSavedPrompts.getState().save(draft);
      onDone();
    } catch (err) {
      toast.error(`Couldn't save the prompt: ${String(err)}`);
      setSaving(false);
    }
  };

  return (
    <form
      className="sp-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="sp-editor-row">
        <div className="field sp-name">
          <label htmlFor={`${idPrefix}-name`}>Name</label>
          <div className="sp-name-input">
            <span aria-hidden="true">/</span>
            <input
              id={`${idPrefix}-name`}
              type="text"
              spellCheck={false}
              placeholder="review"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
        </div>
        <div className="field sp-title">
          <label htmlFor={`${idPrefix}-title`}>Title</label>
          <input
            id={`${idPrefix}-title`}
            type="text"
            placeholder="Review my uncommitted changes"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-body`}>Prompt</label>
        <textarea
          id={`${idPrefix}-body`}
          rows={5}
          placeholder="What the agent should do. It goes in the message box for you to edit before sending."
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
        <span className="hint">
          Letters, digits, - and _ in the name. Type /{draft.name.trim() || "name"} in an agent's
          message box to use it.
        </span>
      </div>
      <div className="sp-editor-foot">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={!canSave}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
