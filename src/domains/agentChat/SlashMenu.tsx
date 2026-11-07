// The agent's slash commands, listed above the composer while you type `/…`.

/** Most commands listed at once. */
const MAX = 8;

/** The commands matching what's typed, or null when the menu shouldn't show. */
export function slashMatches(text: string, commands: readonly string[]): string[] | null {
  const m = /^\/(\S*)$/.exec(text);
  if (!m || commands.length === 0) return null;
  const typed = m[1].toLowerCase();
  const list = commands
    .map((c) => c.replace(/^\//, ""))
    .filter((c) => c.toLowerCase().startsWith(typed));
  if (list.length === 0 || (list.length === 1 && list[0].toLowerCase() === typed)) return null;
  return list.slice(0, MAX);
}

interface SlashMenuProps {
  matches: string[];
  active: number;
  onPick: (command: string) => void;
}

export function SlashMenu({ matches, active, onPick }: SlashMenuProps) {
  return (
    <div className="ac-slash" role="listbox" aria-label="Slash commands">
      {matches.map((c, i) => (
        <button
          key={c}
          type="button"
          role="option"
          aria-selected={i === active}
          className={`ac-slash-item${i === active ? " active" : ""}`}
          // Keep the textarea focused: pick on mousedown, before it blurs.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(c);
          }}
        >
          /{c}
        </button>
      ))}
    </div>
  );
}
