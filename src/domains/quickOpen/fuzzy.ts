// Fuzzy file matching for Quick Open: the query's characters must appear in the path
// in order (case-insensitive), and a match scores higher the more it looks like what
// a person meant — letters at the start of a word or path segment, runs of adjacent
// letters, and a hit in the file name rather than its folders.

/** A path that matched: its score, and which characters matched (for highlighting). */
export interface FuzzyMatch {
  path: string;
  score: number;
  positions: number[];
}

const MATCH = 16;
const CONSECUTIVE = 12;
const BOUNDARY_SLASH = 10;
const BOUNDARY_WORD = 8;
const BOUNDARY_CAMEL = 7;
const FIRST_CHAR = 6;
const GAP = 1;
const GAP_CAP = 8;
const IN_BASENAME = 20;

/** Folders and words start after these. */
const isWordSep = (c: string) => c === "_" || c === "-" || c === "." || c === " ";

/** What a character at `j` earns for where it sits in the path. */
function positionBonus(path: string, j: number): number {
  if (j === 0) return FIRST_CHAR + BOUNDARY_SLASH;
  const prev = path[j - 1];
  if (prev === "/") return BOUNDARY_SLASH;
  if (isWordSep(prev)) return BOUNDARY_WORD;
  const cur = path[j];
  if (prev >= "a" && prev <= "z" && cur >= "A" && cur <= "Z") return BOUNDARY_CAMEL;
  return 0;
}

/** The query as it's matched: lowercase, no spaces, Windows `\` as `/`. */
export function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, "").replace(/\\/g, "/").toLowerCase();
}

/** Cheap pre-check: every query character appears in order. */
function isSubsequence(q: string, lower: string): boolean {
  let at = 0;
  for (const c of q) {
    at = lower.indexOf(c, at);
    if (at < 0) return false;
    at += 1;
  }
  return true;
}

// One pair of score tables, grown as needed and reused for every path: allocating
// fresh ones per path per keystroke is most of the cost on a big repo.
let bestBuf = new Float64Array(1024);
let fromBuf = new Int32Array(1024);
function scratch(size: number): { best: Float64Array; from: Int32Array } {
  if (bestBuf.length < size) {
    bestBuf = new Float64Array(size * 2);
    fromBuf = new Int32Array(size * 2);
  }
  return { best: bestBuf, from: fromBuf };
}

/** Lowercased copies of a path list, made once per list rather than per keystroke. */
const lowered = new WeakMap<readonly string[], string[]>();
function lowerOf(paths: readonly string[]): string[] {
  let out = lowered.get(paths);
  if (!out) {
    out = paths.map((p) => p.toLowerCase());
    lowered.set(paths, out);
  }
  return out;
}

/**
 * Score `path` against an already-normalized query, or null if it doesn't match.
 * A small dynamic programme picks the best placement of each query character, so
 * "fpa" finds `src/domains/agent/FilesPane.tsx`'s F and Pa, not the first f and p.
 */
export function fuzzyMatch(q: string, path: string, lowered?: string): FuzzyMatch | null {
  if (q.length === 0) return { path, score: 0, positions: [] };
  const lower = lowered ?? path.toLowerCase();
  if (!isSubsequence(q, lower)) return null;
  const n = path.length;
  const m = q.length;
  const NONE = Number.NEGATIVE_INFINITY;
  // best[i·n + j]: the best score with q[i] placed at path[j]; from[…]: where q[i-1] sat.
  const { best, from } = scratch(m * n);
  for (let i = 0; i < m; i++) {
    const row = i * n;
    const prevRow = row - n;
    best.fill(NONE, row, row + n);
    // A gap of g skipped characters costs min(g·GAP, GAP_CAP). Over earlier placements
    // k ≤ j-2 of q[i-1], keep the best of each half of that min: `lin` (best[k] + k·GAP,
    // so the cost at j is lin − (j−1)·GAP) and `flat` (best[k], cost GAP_CAP).
    let lin = NONE;
    let linAt = -1;
    let flat = NONE;
    let flatAt = -1;
    for (let j = i; j < n; j++) {
      if (i === 0) {
        // Leading characters skipped before the first match cost a little each.
        if (lower[j] === q[0])
          best[j] = MATCH + positionBonus(path, j) - Math.min(j, GAP_CAP) * 0.1;
        continue;
      }
      if (j >= 2) {
        const k = j - 2;
        const at = best[prevRow + k];
        if (at !== NONE) {
          if (at + k * GAP > lin) {
            lin = at + k * GAP;
            linAt = k;
          }
          if (at > flat) {
            flat = at;
            flatAt = k;
          }
        }
      }
      if (lower[j] !== q[i]) continue;
      const base = MATCH + positionBonus(path, j);
      let score = NONE;
      let at = -1;
      const adjacent = best[prevRow + j - 1];
      if (adjacent !== NONE) {
        score = adjacent + base + CONSECUTIVE;
        at = j - 1;
      }
      if (lin !== NONE && lin - (j - 1) * GAP + base > score) {
        score = lin - (j - 1) * GAP + base;
        at = linAt;
      }
      if (flat !== NONE && flat - GAP_CAP + base > score) {
        score = flat - GAP_CAP + base;
        at = flatAt;
      }
      best[row + j] = score;
      from[row + j] = at;
    }
  }
  const last = (m - 1) * n;
  let end = -1;
  let score = NONE;
  for (let j = m - 1; j < n; j++) {
    if (best[last + j] > score) {
      score = best[last + j];
      end = j;
    }
  }
  if (end < 0) return null;
  const positions = new Array<number>(m);
  for (let i = m - 1, j = end; i >= 0; i--) {
    positions[i] = j;
    j = from[i * n + j];
  }
  // A hit inside the file name beats one spread over its folders.
  const baseStart = path.lastIndexOf("/") + 1;
  if (positions[0] >= baseStart) score += IN_BASENAME;
  // Among equals, the shorter (shallower) path first.
  score -= n * 0.01;
  return { path, score, positions };
}

/**
 * The `limit` best matches for `query`, best first. An empty query lists the first
 * `limit` paths as given, so the picker isn't blank before you type.
 */
export function rankFiles(query: string, paths: readonly string[], limit: number): FuzzyMatch[] {
  if (limit <= 0) return [];
  const q = normalizeQuery(query);
  if (q.length === 0) {
    return paths.slice(0, limit).map((path) => ({ path, score: 0, positions: [] }));
  }
  const lowers = lowerOf(paths);
  // The best `limit` so far, best first: most matches lose to the worst kept one and
  // never reach the sort.
  const out: FuzzyMatch[] = [];
  const better = (a: FuzzyMatch, b: FuzzyMatch) =>
    a.score > b.score || (a.score === b.score && a.path < b.path);
  for (let i = 0; i < paths.length; i++) {
    const hit = fuzzyMatch(q, paths[i], lowers[i]);
    if (!hit) continue;
    if (out.length === limit && !better(hit, out[limit - 1])) continue;
    let at = out.length;
    while (at > 0 && better(hit, out[at - 1])) at--;
    out.splice(at, 0, hit);
    if (out.length > limit) out.pop();
  }
  return out;
}
