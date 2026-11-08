import { useState } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { useAgentChatStore, useQueue } from "./store";

// Messages typed while the agent works, waiting their turn: sent in order, one
// per turn, each editable or removable until it goes.

export function QueueList({ workspaceId }: { workspaceId: string }) {
  const queue = useQueue(workspaceId);
  if (queue.length === 0) return null;
  return (
    <div className="ac-queue">
      <div className="ac-queue-label">Queued · sent in order as each turn ends</div>
      {queue.map((q, i) => (
        <QueuedRow
          key={q.id}
          workspaceId={workspaceId}
          id={q.id}
          text={q.text}
          files={q.attachments.length}
          n={i + 1}
        />
      ))}
    </div>
  );
}

interface QueuedRowProps {
  workspaceId: string;
  id: string;
  text: string;
  /** How many files go with it. */
  files: number;
  n: number;
}

function QueuedRow({ workspaceId, id, text, files, n }: QueuedRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const { editQueued, removeQueued } = useAgentChatStore.getState();
  const save = () => {
    if (draft?.trim()) editQueued(workspaceId, id, draft.trim());
    setDraft(null);
  };
  return (
    <div className="ac-queued">
      <span className="ac-queued-n">{n}</span>
      {draft === null ? (
        <span className="ac-queued-text">
          {text}
          {files > 0 && (
            <span className="ac-queued-files">
              <I.Paperclip size={12} /> {files}
            </span>
          )}
        </span>
      ) : (
        <textarea
          className="ac-queued-edit"
          aria-label="Edit the queued message"
          value={draft}
          rows={Math.min(6, draft.split("\n").length)}
          // biome-ignore lint/a11y/noAutofocus: the user just asked to edit this message
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setDraft(null);
            }
          }}
        />
      )}
      {draft === null && (
        <IconButton size="sm" label="Edit the queued message" onClick={() => setDraft(text)}>
          <I.Pencil size={14} />
        </IconButton>
      )}
      <IconButton
        size="sm"
        label="Remove the queued message"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => removeQueued(workspaceId, id)}
      >
        <I.X size={14} />
      </IconButton>
    </div>
  );
}
