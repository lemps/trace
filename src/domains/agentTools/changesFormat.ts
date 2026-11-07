import type { DiffSummary, FileDiff, FileSummary } from "@/ipc/diff";

// get_session_changes' text: the Files tab's change list, and unified diffs
// rebuilt from its parsed hunks, capped so a big change can't flood the
// agent's context. Pure, so `npm test` can load it.

/** The most diff text one call returns. */
export const DIFF_CAP = 40_000;

const LETTER: Record<FileSummary["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

/** One line per changed file: status letter, path (a rename shows where from), +/− counts. */
export function changeList(summary: DiffSummary): string {
  if (summary.files.length === 0) return `No changes against ${summary.base}.`;
  let add = 0;
  let del = 0;
  const lines = summary.files.map((f) => {
    add += f.add;
    del += f.del;
    const from = f.oldPath ? ` (from ${f.oldPath})` : "";
    return `${LETTER[f.status]} ${f.path}${from} +${f.add} −${f.del}`;
  });
  const files = summary.files.length === 1 ? "1 file" : `${summary.files.length} files`;
  return [
    `${files} changed against ${summary.base}, +${add} −${del}:`,
    ...lines,
    "(A added, M modified, D deleted, R renamed, ? untracked)",
  ].join("\n");
}

/** A file's diff as unified diff text. */
export function unified(diff: FileDiff, file: FileSummary): string {
  const old = file.oldPath ?? file.path;
  const a = file.status === "added" || file.status === "untracked" ? "/dev/null" : `a/${old}`;
  const b = file.status === "deleted" ? "/dev/null" : `b/${file.path}`;
  const out = [`diff --git a/${old} b/${file.path}`, `--- ${a}`, `+++ ${b}`];
  for (const hunk of diff.hunks) {
    out.push(hunk.header);
    for (const line of hunk.lines) {
      out.push(`${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}${line.text}`);
    }
  }
  if (diff.hunks.length === 0) out.push("(no text diff: binary, or only a mode change)");
  return out.join("\n");
}

/**
 * Join diffs until `cap` characters, cutting the last one at a line end. Says
 * how much was left out, and how to get the rest.
 */
export function capDiffs(parts: string[], cap: number = DIFF_CAP): string {
  let text = "";
  for (let i = 0; i < parts.length; i++) {
    const next = text ? `${text}\n\n${parts[i]}` : parts[i];
    if (next.length <= cap) {
      text = next;
      continue;
    }
    const room = next.slice(0, cap);
    const cut = room.lastIndexOf("\n");
    text = cut > text.length ? room.slice(0, cut) : text || room;
    const omitted =
      next.length - text.length + parts.slice(i + 1).reduce((n, p) => n + p.length + 2, 0);
    const files = parts.length - i === 1 ? "this file" : `${parts.length - i} files`;
    return `${text}\n\n[Truncated at ${cap.toLocaleString("en-US")} characters: about ${omitted.toLocaleString("en-US")} more, in ${files}. Ask for one path at a time to see the rest.]`;
  }
  return text;
}
