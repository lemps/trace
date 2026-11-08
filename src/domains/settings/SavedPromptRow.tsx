import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { InlineConfirm } from "@/components/InlineConfirm";
import { useSavedPrompts } from "@/domains/savedPrompts/store";
import type { SavedPrompt } from "@/ipc/savedPrompts";

interface SavedPromptRowProps {
  prompt: SavedPrompt;
  onEdit: () => void;
}

// One saved prompt in Settings: its /name, title and the start of its text, with
// Edit and a delete that asks inline first.
export function SavedPromptRow({ prompt, onEdit }: SavedPromptRowProps) {
  const remove = async () => {
    try {
      await useSavedPrompts.getState().remove(prompt.id);
    } catch (err) {
      toast.error(`Couldn't delete /${prompt.name}: ${String(err)}`);
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
      <IconButton label={`Edit /${prompt.name}`} onClick={onEdit}>
        <I.Pencil size={14} />
      </IconButton>
      <InlineConfirm
        label={<I.Trash size={14} />}
        className="btn icon"
        ariaLabel={`Delete /${prompt.name}`}
        message={`Delete /${prompt.name}?`}
        confirmLabel="Delete"
        onConfirm={() => void remove()}
      />
    </div>
  );
}
