import { useHint } from "@/platform/shortcuts";

// The inbox's key legend, showing the keys as currently bound (Settings → Shortcuts).
export function InboxKeyHints() {
  const next = useHint("inboxNext");
  const prev = useHint("inboxPrev");
  const open = useHint("inboxOpen");
  const dismiss = useHint("inboxDismiss");
  const moveUp = useHint("inboxMoveUp");
  const moveDown = useHint("inboxMoveDown");
  const nextAgent = useHint("nextAgent");
  return (
    <div className="ib-keys">
      <span>
        <span className="kbd">{next}</span> <span className="kbd">{prev}</span> move
      </span>
      <span>
        <span className="kbd">{open}</span> open
      </span>
      <span>
        <span className="kbd">{dismiss}</span> dismiss
      </span>
      <span>
        <span className="kbd">{moveUp}</span> <span className="kbd">{moveDown}</span> reorder
      </span>
      <span>
        <span className="kbd">{nextAgent}</span> next needing you, anywhere
      </span>
    </div>
  );
}
