// A long tool result, cut for a folded look: its head and its tail, with a line
// saying how much of the middle is left out. The middle is rarely the point (a
// build's progress, a test run's passes); the start and the verdict are. Shared
// by the chat's tool cards and the transcript's tool rows.

/** Output longer than this many lines is cut to its head and tail. */
export const OUTPUT_LINES = 40;

export interface Trimmed {
  /** What to draw: the whole text, or its head, a "… N more lines …" line and its tail. */
  text: string;
  /** Lines in the whole text. */
  total: number;
  /** Lines left out of `text` (0 when nothing was cut). */
  hidden: number;
}

/** `text` cut to `max` lines (half from the start, half from the end) when it's longer. */
export function trimLines(text: string, max = OUTPUT_LINES): Trimmed {
  const lines = text.split("\n");
  // A trailing newline isn't a line of output.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const total = lines.length;
  if (total <= max) return { text, total, hidden: 0 };
  const head = Math.ceil(max / 2);
  const tail = max - head;
  const hidden = total - max;
  const cut = [
    ...lines.slice(0, head),
    `… ${hidden} more ${hidden === 1 ? "line" : "lines"} …`,
    ...lines.slice(total - tail),
  ];
  return { text: cut.join("\n"), total, hidden };
}
