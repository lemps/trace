// Claude marks the option it suggests by ending its label with "(Recommended)".
// The question card shows that as a quiet tag after the label instead. Display
// only: the answer sent back is always the option's label exactly as written.

/** A trailing "(Recommended)", any case, with any whitespace around and inside it. */
const TRAILING = /\s*\(\s*recommended\s*\)\s*$/i;

export interface ShownLabel {
  /** The label without the mark, for display. */
  label: string;
  recommended: boolean;
}

/**
 * Split a trailing "(Recommended)" off an option's label. A label that is only
 * the mark keeps it, so there's always something to show.
 */
export function splitRecommended(label: string): ShownLabel {
  const match = TRAILING.exec(label);
  if (!match) return { label, recommended: false };
  const rest = label.slice(0, match.index);
  if (!rest.trim()) return { label, recommended: false };
  return { label: rest, recommended: true };
}
