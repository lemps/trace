// Each workspace's recent PTY output. Agents run for hours and redraw constantly, so
// this has to stay bounded. It's only a recent tail, read by search and transcripts:
// the terminal keeps its own scrollback, and writes chunks the moment they arrive.

/** One PTY output chunk. */
export interface OutputChunk {
  /** Renderer-assigned and never reused, so it still orders chunks after a trim or a
   * restart. The backend's `seq` can't: it starts again at 1 on every run. */
  id: number;
  /** The backend's counter for this run, for the history replay handoff. */
  seq: number;
  /** Base64 bytes. */
  data: string;
  /** Characters appended to this buffer so far, making its size an O(1) lookup. */
  total: number;
}

/** Per-workspace budget, in base64 characters. Same as the backend's rolling history
 * (`OUTPUT_HISTORY_CAP`): ~2 MiB encoded, ~1.5 MiB raw. */
export const OUTPUT_BUFFER_CAP = 2 * 1024 * 1024;
/** What a trim leaves behind. Well under the cap, so appends don't each trim. */
const OUTPUT_BUFFER_KEEP = (OUTPUT_BUFFER_CAP * 3) / 4;

let lastChunkId = 0;

/** The buffer with a new chunk on the end, dropping the oldest once it's over budget. */
export function appendChunk(prev: OutputChunk[], seq: number, data: string): OutputChunk[] {
  const total = (prev[prev.length - 1]?.total ?? 0) + data.length;
  const chunk: OutputChunk = { id: ++lastChunkId, seq, data, total };
  const first = prev[0];
  const held = first ? total - first.total + first.data.length : data.length;
  if (held <= OUTPUT_BUFFER_CAP) return [...prev, chunk];
  let keepFrom = 0;
  while (keepFrom < prev.length && prev[keepFrom].total <= total - OUTPUT_BUFFER_KEEP) keepFrom++;
  return [...prev.slice(keepFrom), chunk];
}

/** The index of the first chunk newer than `lastId`, or the length if there are none.
 * Walks back from the end, so nothing new costs one comparison. */
export function firstUnseenIndex(chunks: OutputChunk[], lastId: number): number {
  let i = chunks.length;
  while (i > 0 && chunks[i - 1].id > lastId) i--;
  return i;
}
