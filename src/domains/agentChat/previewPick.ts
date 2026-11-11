// Which option's preview a question shows, and how its text is drawn. Pure, so
// `node:test` covers it.

interface PreviewOption {
  label: string;
  preview?: string;
}

export interface ShownPreview {
  /** The option it belongs to, as the agent wrote it. */
  label: string;
  text: string;
}

/**
 * The preview on show: the option pointed at or focused, if it has one; else the
 * picked option's; else the first there is, so the pane never opens empty. Null
 * when no option of the question carries a preview.
 */
export function shownPreview(
  options: readonly PreviewOption[],
  picked: readonly string[],
  pointed: number | null
): ShownPreview | null {
  const of = (o: PreviewOption | undefined): ShownPreview | null =>
    o?.preview ? { label: o.label, text: o.preview } : null;
  const at = pointed === null ? null : of(options[pointed]);
  if (at) return at;
  const chosen = of(options.find((o) => o.preview && picked.includes(o.label)));
  return chosen ?? of(options.find((o) => o.preview));
}

/**
 * A preview with a fenced block is Markdown (its code gets the code theme). Anything
 * else is kept exactly as written, in mono: an ASCII mock-up lives on its spacing,
 * which Markdown would collapse.
 */
export function previewIsMarkdown(text: string): boolean {
  return /^\s*(```|~~~)/m.test(text);
}
