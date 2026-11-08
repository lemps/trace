// A chat message as plain text (its menu's "Copy as plain text"), and when it was
// said (its hover bar). Copy copies the Markdown source; this drops the marks.

const FENCE = /^\s*(```|~~~)/;
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!~>|])/g;

/** One line's inline marks gone: emphasis, code spans, links (text and address), escapes. */
function plainLine(line: string): string {
  // An escaped mark is text: set it aside so the rules below can't take it.
  const kept = line.replace(ESCAPED, (_, c: string) => `\uE000${c.charCodeAt(0)}\uE001`);
  return (
    kept
      // Headings and quotes lose their markers; lists keep theirs (they read as text).
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s{0,3}(>\s?)+/, "")
      // Images keep their alt text; links their text, then the address unless it's the same.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, text: string, url: string) =>
        text === url ? url : `${text} (${url})`
      )
      .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
      .replace(/`+([^`]+?)`+/g, "$1")
      .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
      .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "$1")
      // Single marks only at word edges, so snake_case and 2*3*4 survive.
      .replace(/(^|[^\w*])\*(?=\S)([^*]+?)(?<=\S)\*(?![\w*])/g, "$1$2")
      .replace(/(^|[^\w])_(?=\S)([^_]+?)(?<=\S)_(?!\w)/g, "$1$2")
      .replace(/\uE000(\d+)\uE001/g, (_, code: string) => String.fromCharCode(Number(code)))
  );
}

/** `markdown` without its marks. Code blocks keep their text exactly, minus the fences. */
export function plainText(markdown: string): string {
  const out: string[] = [];
  let inCode = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) {
      inCode = !inCode;
      continue;
    }
    out.push(inCode ? line : plainLine(line));
  }
  return out.join("\n").trim();
}

/** "14:05" today, else "3 Nov, 14:05": when a message was said, in its hover bar. */
export function messageTime(at: number, now: number = Date.now()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (new Date(now).toDateString() === d.toDateString()) return time;
  const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${day}, ${time}`;
}

/** The full date and time, for the timestamp's tooltip. */
export function messageTimeFull(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
}
