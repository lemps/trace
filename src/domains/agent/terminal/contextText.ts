// The text Copy Context puts on the clipboard: a header saying where the output came
// from, then the output in a fence. Pure (no xterm, no stores) so it's tested alone.

/** How many lines Copy Context takes when nothing is selected. */
export const CONTEXT_LINES = 100;

/** The part of an xterm buffer line this reads (`IBufferLine`). */
export interface LineLike {
  isWrapped: boolean;
  translateToString(trimRight?: boolean): string;
}

/** The part of an xterm buffer this reads (`IBuffer`). */
export interface BufferLike {
  length: number;
  getLine(y: number): LineLike | undefined;
}

/**
 * The last `count` logical lines of a buffer, soft-wrapped rows joined back into one
 * line and the blank rows below the output (an unfilled screen) dropped.
 */
export function lastLines(buffer: BufferLike, count: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (let y = 0; y < buffer.length; y++) {
    const row = buffer.getLine(y);
    if (!row) continue;
    const next = buffer.getLine(y + 1);
    // A row that continues on the next keeps its trailing spaces: they're real text.
    current += row.translateToString(!next?.isWrapped);
    if (!next?.isWrapped) {
      lines.push(current.trimEnd());
      current = "";
    }
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(-count);
}

/** Where a terminal's output came from, for the header. */
export interface ContextSource {
  /** "agent", "shell" or "scheduled run". */
  kind: string;
  /** The agent's or ticket's name, when it has one. */
  label?: string;
  /** The ticket key or workspace id. */
  id: string;
  cwd?: string;
  branch?: string | null;
}

/** A fence the text can't close early: one backtick longer than any run inside it. */
function fenceFor(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return "`".repeat(longest + 1);
}

/** The clipboard text: header lines, then the output fenced. */
export function formatContext(source: ContextSource, body: string, isSelection: boolean): string {
  const name =
    source.label && source.label !== source.id ? `${source.label} (${source.id})` : source.id;
  const header = [`Terminal output from trace — ${source.kind} ${name}`];
  if (source.cwd) {
    const branch = source.branch ? ` on branch ${source.branch}` : "";
    header.push(`Working directory: ${source.cwd}${branch}`);
  }
  const lineCount = body === "" ? 0 : body.split("\n").length;
  header.push(isSelection ? "Selected text:" : `Last ${lineCount} lines:`);
  const fence = fenceFor(body);
  return `${header.join("\n")}\n${fence}text\n${body}\n${fence}\n`;
}
