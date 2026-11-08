const WORDS: Record<string, string> = {
  open: "Open",
  draft: "Draft",
  merged: "Merged",
  closed: "Closed",
  // Jira dev-status's name for closed without merging.
  declined: "Closed",
};

/**
 * A PR state as the word people read ("Merged"), not the raw lowercase value
 * GitHub or Jira sends. An unknown state is shown capitalised rather than hidden.
 */
export function prStateLabel(state: string): string {
  const key = state.toLowerCase();
  return WORDS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}
