// Naming a session from the task its user typed. Pure, with no imports, so
// `npm test` can load it: the model call that usually does the naming lives in
// `titleFromPrompt.ts` beside it.

/** Longest name we make: enough to recognise in the list, short enough not to wrap. */
export const MAX_TITLE = 40;

/**
 * The name to use with no model: the task's first line, collapsed and cut on a word
 * boundary.
 */
export function titleFromText(prompt: string): string {
  const line = prompt.trim().split("\n")[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (line.length <= MAX_TITLE) return line;
  const cut = line.slice(0, MAX_TITLE);
  const space = cut.lastIndexOf(" ");
  // Only break on a space that leaves most of the name: one early word isn't a name.
  const kept = space > MAX_TITLE / 2 ? cut.slice(0, space) : cut;
  return `${kept.trimEnd()}…`;
}

/** A trailing full stop or middle dot a model added despite being asked not to. */
const TRAILING_PUNCTUATION = /[.·]+$/;

/** A model's name for a session, tidied; empty when it gave nothing usable. */
export function cleanTitle(named: string | null): string {
  return (named ?? "").replace(TRAILING_PUNCTUATION, "").trim();
}
