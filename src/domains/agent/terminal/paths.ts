// File paths in terminal text: where they are on a line, and what they point at.
// Pure, so the matching rules are tested on their own (`paths.test.ts`).

/** A file path found in one line of terminal text. */
export interface PathMatch {
  /** 0-based start and end (exclusive) in the line, the `:line:col` suffix included. */
  start: number;
  end: number;
  /** The path itself, without the suffix. */
  path: string;
  line?: number;
  col?: number;
}

// A path is one of:
//   • segments with a separator, ending in `name.ext` — src/a.ts, ./x/y.rs, C:\a\b.md, /etc/x.conf
//   • a bare `name.ext` directly followed by `:line` — main.rs:12
// then an optional `:line` or `:line:col`. The look-behind keeps a match from starting
// inside a word or a URL (`https://x.com/a.js` has no path in it), and the look-ahead
// from stopping part-way through one (`a.b/c` isn't `a.b`).
const SEG = String.raw`[\w.@+-]+`;
const NAME = String.raw`[\w@+-][\w.@+-]*\.[A-Za-z][\w]{0,11}`;
const PREFIX = String.raw`(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|[\\/])?`;
const PATH_RE = new RegExp(
  String.raw`(?<![\w./\\:~-])(${PREFIX}(?:${SEG}[\\/])+${NAME}|${NAME}(?=:\d))(?::(\d+)(?::(\d+))?)?(?![\w/\\])`,
  "g"
);

/** Every file path in a line of terminal text, in order. */
export function findPaths(text: string): PathMatch[] {
  const out: PathMatch[] = [];
  for (const m of text.matchAll(PATH_RE)) {
    const start = m.index ?? 0;
    const path = m[1];
    if (path.includes("://")) continue;
    out.push({
      start,
      end: start + m[0].length,
      path,
      line: m[2] ? Number(m[2]) : undefined,
      col: m[3] ? Number(m[3]) : undefined,
    });
  }
  return out;
}

/** Whether a path is absolute on any of the OSes trace runs on. */
export function isAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\");
}

/**
 * `path` made absolute against `cwd` (the terminal's working directory), in the
 * separator `cwd` uses. `./` and `../` segments are folded away.
 */
export function resolvePath(cwd: string, path: string): string {
  if (isAbsolutePath(path)) return path;
  const sep = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  const parts = cwd.split(/[\\/]/);
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  for (const seg of path.split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length > 1) parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join(sep);
}
