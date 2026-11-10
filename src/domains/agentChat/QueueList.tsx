import { useState } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import type { Deliver } from "./hooks/useDeliver";
import { useAgentChatStore, useQueue } from "./store";

// Messages queued while the agent works, waiting their turn: sent in order, one
// per turn, each editable or removable until it goes. While a turn runs, one can
// be sent now instead, into that turn. While the agent is stopped they wait for
// it to start (a send to a stopped agent starts it).

interface QueueListProps {
  workspaceId: string;
  stopped: boolean;
  /** A turn is running: a queued message can join it now. */
  busy: boolean;
  deliver: Deliver;
}

export function QueueList({ workspaceId, stopped, busy, deliver }: QueueListProps) {
  const queue = useQueue(workspaceId);
  if (queue.length === 0) return null;
  return (
    <div className="ac-queue">
      <div className="ac-queue-label">
        {stopped
          ? "Queued · sent once the agent starts"
          : "Queued · sent in order as each turn ends"}
      </div>
      {queue.map((q, i) => (
        <QueuedRow
          key={q.id}
          workspaceId={workspaceId}
          id={q.id}
          text={q.text}
          files={q.attachments.length}
          n={i + 1}
          onSendNow={
            busy
              ? () => {
                  useAgentChatStore.getState().removeQueued(workspaceId, q.id);
                  deliver(q.text, q.attachments, "now");
                }
              : undefined
          }
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
  /** Set while a turn runs: send it into that turn instead of after it. */
  onSendNow?: () => void;
}

function QueuedRow({ workspaceId, id, text, files, n, onSendNow }: QueuedRowProps) {
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
      {draft === null && onSendNow && (
        <IconButton size="sm" label="Send it now" onClick={onSendNow}>
          <I.Send size={14} />
        </IconButton>
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
