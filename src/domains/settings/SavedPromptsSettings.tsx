import { useEffect, useState } from "react";
import { I } from "@/components/Icon";
import { useSavedPrompts } from "@/domains/savedPrompts/store";
import { SavedPromptEditor } from "./SavedPromptEditor";
import { SavedPromptRow } from "./SavedPromptRow";

/** Which prompt the editor is open on: an id, a new one, or none. */
type Editing = { id: string } | "new" | null;

const NEW_PROMPT = { name: "", title: "", body: "" };

// Settings → Agents → Saved prompts: reusable messages offered in every agent's
// slash menu. Picking one (or typing /name and Enter) puts its text in the message
// box to edit and send. Two built-ins to start; any can be edited or deleted.
export function SavedPromptsSettings() {
  const prompts = useSavedPrompts((s) => s.prompts);
  const loaded = useSavedPrompts((s) => s.loaded);
  const [editing, setEditing] = useState<Editing>(null);
  useEffect(() => useSavedPrompts.getState().ensure(), []);

  return (
    <section className="setting-group">
      <h2>Saved prompts</h2>
      <div className="desc">
        Type /name in an agent's message box to put a prompt there, ready to edit and send. If the
        agent has a command with the same name, use /saved:name.
      </div>
      <div className="sp-list">
        {prompts.map((p) =>
          editing !== "new" && editing?.id === p.id ? (
            <SavedPromptEditor key={p.id} initial={p} onDone={() => setEditing(null)} />
          ) : (
            <SavedPromptRow key={p.id} prompt={p} onEdit={() => setEditing({ id: p.id })} />
          )
        )}
        {loaded && prompts.length === 0 && editing !== "new" && (
          <div className="sp-empty">
            No saved prompts. Add one to reuse it from any agent's / menu.
          </div>
        )}
        {editing === "new" ? (
          <SavedPromptEditor initial={NEW_PROMPT} onDone={() => setEditing(null)} />
        ) : (
          <div>
            <button type="button" className="btn" onClick={() => setEditing("new")}>
              <I.Plus size={13} /> Add a prompt
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
