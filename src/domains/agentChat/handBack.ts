// Claude Code hands a subagent's report back to the main agent inside a frame:
// a "[Subagent hand-back] … The report follows:" paragraph at column zero, then
// the report with every line indented (so a forged frame line inside it can't
// sit at column zero). The frame is for the model, not the reader: the chat
// shows the report alone. Its wording changes between Claude Code versions, so
// it's matched on its two ends; text without both is left as it is. The Rust
// adapter does the same for new journals (`claude/handback.rs`); this one keeps
// journals saved before that readable.

const ANCHOR = "[Subagent hand-back]";
const MARKER = "The report follows:";
/** Claude's note of the tools a subagent used, which can come before the frame. */
const TOOLS_NOTE = /<tools-used[^>]*>[\s\S]*?<\/tools-used[^>]*>/g;

/** The subagent's report without Claude Code's hand-back frame around it. */
export function unwrapHandBack(text: string): string {
  const start = anchorAt(text);
  if (start < 0) return text;
  const marker = text.indexOf(MARKER, start + ANCHOR.length);
  if (marker < 0) return text;
  const report = dedentReport(text.slice(marker + MARKER.length));
  const before = text.slice(0, start).replace(TOOLS_NOTE, "");
  const note = dedent(before.split("\n")).join("\n").trim();
  return note ? `${note}\n\n${report}` : report;
}

/** Where the frame starts: the anchor at the start of a line, not inside one. */
function anchorAt(text: string): number {
  let at = text.indexOf(ANCHOR);
  while (at > 0 && text[at - 1] !== "\n") at = text.indexOf(ANCHOR, at + 1);
  return at;
}

/** The report after the marker: on the marker's line or the next, dedented. */
function dedentReport(rest: string): string {
  const lines = rest.split("\n");
  const first = lines[0].trim();
  const body = dedent(lines.slice(1));
  return (first ? [first, ...body] : body).join("\n").trim();
}

/** Remove the indent every non-blank line shares; blank lines become empty. */
function dedent(lines: readonly string[]): string[] {
  let indent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (!line.trim()) continue;
    indent = Math.min(indent, line.length - line.trimStart().length);
  }
  if (!Number.isFinite(indent)) return lines.map(() => "");
  return lines.map((line) => (line.trim() ? line.slice(indent) : ""));
}
