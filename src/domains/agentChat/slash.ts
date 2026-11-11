// What the composer's slash menu offers: the agent's own commands and the user's
// saved prompts (Settings → Agents). Pure, so it's tested on its own (`slash.test.ts`).
//
// A saved prompt is `/name`, unless the agent already has a command by that name:
// the agent's wins, and the saved one becomes `/saved:name`. Picking a command types
// it; picking a saved prompt (or typing `/name` and Enter) puts its text in the box
// to edit before sending. Every match is listed (the menu scrolls), each command with
// what it does when Claude Code says (`claudeCatalog`), so `/` alone shows them all.

/** The parts of a saved prompt the menu needs. */
export interface SlashPrompt {
  name: string;
  title: string;
  body: string;
}

/** What a command does, as Claude Code describes it. */
export interface CommandDetail {
  name: string;
  description: string;
  /** What it takes after its name ("[instructions]"), or empty. */
  argumentHint: string;
}

export interface SlashEntry {
  /** What's typed after `/`, and shown: `compact`, `review`, `saved:review`. */
  label: string;
  /** Set for a saved prompt: what the menu shows beside it and what it fills in. */
  saved?: SlashPrompt;
  /** Set for a command Claude Code describes. */
  detail?: CommandDetail;
}

/**
 * Every entry: saved prompts first (they're the user's own), then the agent's
 * commands. Before the agent has said what it has (it's stopped, or starting),
 * the commands Claude Code lists (`details`) stand in.
 */
export function slashEntries(
  commands: readonly string[],
  prompts: readonly SlashPrompt[],
  details: readonly CommandDetail[] = []
): SlashEntry[] {
  const own = commands.map((c) => c.replace(/^\//, ""));
  const names = own.length ? own : details.map((d) => d.name);
  const described = new Map(details.map((d) => [d.name.toLowerCase(), d]));
  const taken = new Set(names.map((n) => n.toLowerCase()));
  const saved = prompts.map((p) => ({
    label: taken.has(p.name.toLowerCase()) ? `saved:${p.name}` : p.name,
    saved: p,
  }));
  return [
    ...saved,
    ...names.map((label) => {
      const detail = described.get(label.toLowerCase());
      return detail ? { label, detail } : { label };
    }),
  ];
}

/** Does `typed` (lowercase, no `/`) start this entry's label, or a saved prompt's bare name? */
function matches(entry: SlashEntry, typed: string): boolean {
  if (entry.label.toLowerCase().startsWith(typed)) return true;
  return entry.saved?.name.toLowerCase().startsWith(typed) ?? false;
}

/** The entries matching what's typed, or null when the menu shouldn't show. */
export function slashMatches(text: string, entries: readonly SlashEntry[]): SlashEntry[] | null {
  const m = /^\/(\S*)$/.exec(text);
  if (!m || entries.length === 0) return null;
  const typed = m[1].toLowerCase();
  const list = entries.filter((e) => matches(e, typed));
  // An exact match goes first, so Enter takes what was typed.
  const exact = list.filter((e) => e.label.toLowerCase() === typed);
  const ordered = [...exact, ...list.filter((e) => !exact.includes(e))];
  if (ordered.length === 0) return null;
  // A command typed in full needs no menu: Enter sends it. A saved prompt keeps its
  // row, so you can see what Enter will put in the box.
  const only = ordered[0];
  if (ordered.length === 1 && !only.saved && only.label.toLowerCase() === typed) return null;
  return ordered;
}

/** The saved prompt's text when the box holds exactly its `/label`, else null. */
export function expandSaved(text: string, entries: readonly SlashEntry[]): string | null {
  const m = /^\/(\S+)$/.exec(text.trim());
  if (!m) return null;
  const typed = m[1].toLowerCase();
  const hit = entries.find((e) => e.saved && e.label.toLowerCase() === typed);
  return hit?.saved?.body ?? null;
}
