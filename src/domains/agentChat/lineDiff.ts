import type { FileDiff } from "./types.ts";

// A diff card's lines, from either half of the contract: `before`/`after` text
// (diffed here, line by line) or a unified `patch` (parsed). Unchanged runs far
// from any change fold into one gap line so a one-line edit in a long file stays
// one card's worth of lines.

export type DiffLine =
  | { kind: "add" | "del" | "ctx"; text: string; oldNo?: number; newNo?: number }
  | { kind: "gap"; text: string };

/** Unchanged lines kept either side of a change. */
const CONTEXT = 3;
/** Above this many cells the LCS table costs too much; show a replace instead. */
const MAX_CELLS = 1_500_000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** A line diff of `before` → `after` (LCS on lines), with far context folded. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const out: DiffLine[] = [];
  for (let i = 0; i < start; i++) out.push({ kind: "ctx", text: a[i], oldNo: i + 1, newNo: i + 1 });
  const mid = middle(a.slice(start, endA), b.slice(start, endB), start);
  out.push(...mid);
  for (let i = endA, j = endB; i < a.length; i++, j++) {
    out.push({ kind: "ctx", text: a[i], oldNo: i + 1, newNo: j + 1 });
  }
  return foldContext(out);
}

function middle(a: string[], b: string[], offset: number): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const out: DiffLine[] = [];
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    for (let i = 0; i < n; i++) out.push({ kind: "del", text: a[i], oldNo: offset + i + 1 });
    for (let j = 0; j < m; j++) out.push({ kind: "add", text: b[j], newNo: offset + j + 1 });
    return out;
  }
  // lcs[i][j] = LCS length of a[i..] and b[j..], flattened.
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * w + j + 1] + 1
          : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ kind: "ctx", text: a[i], oldNo: offset + i + 1, newNo: offset + j + 1 });
      i++;
      j++;
    } else if (i < n && (j === m || lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) {
      // Removals before additions on a tie, as git shows them.
      out.push({ kind: "del", text: a[i], oldNo: offset + i + 1 });
      i++;
    } else {
      out.push({ kind: "add", text: b[j], newNo: offset + j + 1 });
      j++;
    }
  }
  return out;
}

/** Replace runs of context further than CONTEXT lines from a change with a gap. */
export function foldContext(lines: DiffLine[]): DiffLine[] {
  const near = new Uint8Array(lines.length);
  lines.forEach((l, i) => {
    if (l.kind !== "add" && l.kind !== "del") return;
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(lines.length - 1, i + CONTEXT); k++) {
      near[k] = 1;
    }
  });
  const out: DiffLine[] = [];
  let hidden = 0;
  const flush = () => {
    if (hidden > 0)
      out.push({ kind: "gap", text: `${hidden} unchanged line${hidden === 1 ? "" : "s"}` });
    hidden = 0;
  };
  lines.forEach((l, i) => {
    if (l.kind === "ctx" && !near[i]) {
      hidden++;
      return;
    }
    flush();
    out.push(l);
  });
  flush();
  return out;
}

/** A unified diff (git's, or Codex's `*** Update File` patches) as lines. */
export function parsePatch(patch: string): DiffLine[] {
  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  // Header lines (`--- a/x`) only count outside a hunk: inside one, `--- x` is a
  // removed line that starts with "--".
  let inHunk = false;
  for (const raw of splitLines(patch)) {
    if (/^(diff --git |\*\*\* )/.test(raw)) {
      inHunk = false;
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      inHunk = true;
      out.push({ kind: "gap", text: hunk[3].trim() || raw });
      continue;
    }
    if (raw.startsWith("@@")) {
      inHunk = true;
      out.push({ kind: "gap", text: raw.slice(2).trim() || "…" });
      continue;
    }
    if (!inHunk && /^(index |--- |\+\+\+ |new file mode|deleted file mode)/.test(raw)) {
      continue;
    }
    if (raw.startsWith("\\ No newline")) continue;
    if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo: newNo ? newNo++ : undefined });
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo: oldNo ? oldNo++ : undefined });
    } else {
      const text = raw.startsWith(" ") ? raw.slice(1) : raw;
      out.push({
        kind: "ctx",
        text,
        oldNo: oldNo ? oldNo++ : undefined,
        newNo: newNo ? newNo++ : undefined,
      });
    }
  }
  return out;
}

/** A diff row's lines, whichever form it came in. */
export function linesOf(diff: FileDiff): DiffLine[] {
  if (diff.patch) return parsePatch(diff.patch);
  return diffLines(diff.before ?? "", diff.after ?? "");
}

/** How many lines were added and removed. */
export function countChanges(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "add") added++;
    else if (l.kind === "del") removed++;
  }
  return { added, removed };
}
