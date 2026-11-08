import { useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { useSavedPrompts } from "@/domains/savedPrompts/store";
import type { SavedPrompt } from "@/ipc/savedPrompts";

interface SavedPromptRowProps {
  prompt: SavedPrompt;
  onEdit: () => void;
}

// One saved prompt in Settings: its /name, title and the start of its text, with
// Edit and a delete that asks inline first.
export function SavedPromptRow({ prompt, onEdit }: SavedPromptRowProps) {
  const [confirming, setConfirming] = useState(false);
  const remove = async () => {
    try {
      await useSavedPrompts.getState().remove(prompt.id);
    } catch (err) {
      toast.error(`Couldn't delete /${prompt.name}: ${String(err)}`);
      setConfirming(false);
    }
  };

  return (
    <div className="sp-row">
      <span className="sp-row-name">/{prompt.name}</span>
      <span className="sp-row-text">
        <span className="sp-row-title">{prompt.title}</span>
        <span className="sp-row-body" title={prompt.body}>
          {prompt.body}
        </span>
      </span>
      {confirming ? (
        <>
          <span className="sp-row-ask">Delete /{prompt.name}?</span>
          <button type="button" className="btn" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button type="button" className="btn danger" onClick={() => void remove()}>
            Delete
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn" onClick={onEdit}>
            Edit
          </button>
          <IconButton
            label={`Delete /${prompt.name}`}
            title="Delete"
            onClick={() => setConfirming(true)}
          >
            <I.Trash size={14} />
          </IconButton>
        </>
      )}
    </div>
  );
}
