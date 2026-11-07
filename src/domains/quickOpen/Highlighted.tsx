interface HighlightedProps {
  path: string;
  /** Indexes into `path` that the query matched. */
  positions: readonly number[];
}

/** Runs of `text` (starting at `offset` in the whole path), marked where they matched. */
function marked(text: string, offset: number, hit: ReadonlySet<number>) {
  const runs: { text: string; isHit: boolean; at: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const isHit = hit.has(offset + i);
    const last = runs[runs.length - 1];
    if (last && last.isHit === isHit) last.text += text[i];
    else runs.push({ text: text[i], isHit, at: offset + i });
  }
  return runs.map((r) =>
    r.isHit ? (
      <mark key={r.at} className="qo-hit">
        {r.text}
      </mark>
    ) : (
      <span key={r.at}>{r.text}</span>
    )
  );
}

// A Quick Open result: the file name first, its folder after it in quieter type,
// with the characters the query matched marked in both.
export function Highlighted({ path, positions }: HighlightedProps) {
  const hit = new Set(positions);
  const cut = path.lastIndexOf("/") + 1;
  return (
    <>
      <span className="qo-name">{marked(path.slice(cut), cut, hit)}</span>
      {cut > 0 && <span className="qo-dir">{marked(path.slice(0, cut - 1), 0, hit)}</span>}
    </>
  );
}
