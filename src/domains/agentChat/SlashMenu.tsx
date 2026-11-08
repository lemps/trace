import type { SlashEntry } from "./slash";

// The slash menu above the composer while you type `/…`: the user's saved prompts
// (marked, with their title) and the agent's own commands.

interface SlashMenuProps {
  matches: SlashEntry[];
  active: number;
  onPick: (entry: SlashEntry) => void;
}

export function SlashMenu({ matches, active, onPick }: SlashMenuProps) {
  return (
    <div className="ac-slash" role="listbox" aria-label="Slash commands and saved prompts">
      {matches.map((entry, i) => (
        <button
          key={`${entry.saved ? "s" : "c"}:${entry.label}`}
          type="button"
          role="option"
          aria-selected={i === active}
          className={`ac-slash-item${i === active ? " active" : ""}`}
          title={entry.saved ? "Puts this saved prompt in the box to edit and send" : undefined}
          // Keep the textarea focused: pick on mousedown, before it blurs.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(entry);
          }}
        >
          <span className="ac-slash-name">/{entry.label}</span>
          {entry.saved && (
            <>
              <span className="ac-slash-title">{entry.saved.title}</span>
              <span className="ac-slash-tag">Saved</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
