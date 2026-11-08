// Claude Code's explanatory output style sets asides apart with two lines:
//
//   `★ Insight ─────────────────────────────────────`
//   - a point worth learning
//   `─────────────────────────────────────────────────`
//
// As Markdown those are two stray code spans. `splitInsights` cuts the text
// around them so the renderer can draw each aside as a callout card instead.
// It reads line by line and skips fenced code, so an example of the markers
// inside a code block stays code. An aside still being written (its closing
// line not here yet) runs to the end of the text, the way an unclosed fence
// does, so a streaming reply shows the card from its first line.

export interface Segment {
  kind: "text" | "insight";
  /** The Markdown in this part; an insight's without its two marker lines. */
  text: string;
}

/** The opening line: "★ Insight", optionally ruled off, usually in backticks. */
const OPEN = /^\s*`?★\s*Insight\b[\s─-]*`?\s*$/;
/** The closing line: a rule of box-drawing dashes, usually in backticks. */
const CLOSE = /^\s*`?─{3,}`?\s*$/;
/** A code fence's opening or closing line (``` or ~~~, up to 3 spaces in). */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** `text` cut into plain Markdown and the insight asides between it, in order. */
export function splitInsights(text: string): Segment[] {
  if (!text.includes("★")) return [{ kind: "text", text }];
  const segments: Segment[] = [];
  let plain: string[] = [];
  let aside: string[] | null = null;
  let fence: string | null = null;

  const flushPlain = () => {
    if (plain.some((l) => l.trim())) segments.push({ kind: "text", text: plain.join("\n") });
    plain = [];
  };
  const flushAside = () => {
    if (aside) segments.push({ kind: "insight", text: aside.join("\n").trim() });
    aside = null;
  };

  for (const line of text.split("\n")) {
    const into = aside ?? plain;
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      // A fence closes on a run of its own character at least as long.
      if (
        marker &&
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        !line.trim().slice(marker.length)
      ) {
        fence = null;
      }
      into.push(line);
    } else if (marker) {
      fence = marker;
      into.push(line);
    } else if (!aside && OPEN.test(line)) {
      flushPlain();
      aside = [];
    } else if (aside && CLOSE.test(line)) {
      flushAside();
    } else {
      into.push(line);
    }
  }
  flushAside();
  flushPlain();
  return segments.length > 0 ? segments : [{ kind: "text", text }];
}
