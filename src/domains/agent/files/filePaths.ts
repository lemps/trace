// Paths inside a worktree, as the Files tab keys them: relative, `/`-separated, no
// leading `./` or trailing slash — git's own form, on every OS. A path from outside
// git (a Windows `src\a.ts`) goes through `worktreeRelative` in `platform/paths`
// first: only there is `\` known to be a separator rather than part of a name.

/** `path` as the tree keys it: `./src/a//b.ts/` and `src/a/b.ts` are one file. */
export function toTreePath(path: string): string {
  return path
    .replace(/\/{2,}/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+|\/+$/g, "");
}

/** The folders holding `path`, outermost first: `a/b/c.ts` → `a`, `a/b`. */
export function ancestorsOf(path: string): string[] {
  const parts = toTreePath(path).split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

/** The folder holding `path` ("" at the top level). */
export function parentOf(path: string): string {
  const p = toTreePath(path);
  const cut = p.lastIndexOf("/");
  return cut < 0 ? "" : p.slice(0, cut);
}

/** One breadcrumb: a segment's name and the path up to and including it. */
export interface Crumb {
  name: string;
  path: string;
}

/** `src/a/b.ts` → `src`, `src/a`, `src/a/b.ts`, for the viewer's breadcrumbs. */
export function crumbsOf(path: string): Crumb[] {
  const parts = toTreePath(path).split("/").filter(Boolean);
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join("/") }));
}

/** What the breadcrumbs can measure: each crumb's natural width (folders, then the file). */
export interface CrumbWidths {
  crumbs: readonly number[];
  /** A separator between two crumbs. */
  sep: number;
}

/**
 * Which folders the breadcrumbs hide, as `[start, end)` indexes into the crumbs, or
 * null when everything fits in `available`. Only when it doesn't: the first folder
 * and the last two stay whole, and every folder between them goes behind one "…".
 * A path with no folders between those has nothing to hide; its file name shrinks.
 */
export function collapseCrumbs(w: CrumbWidths, available: number): [number, number] | null {
  const n = w.crumbs.length;
  const total = w.crumbs.reduce((a, b) => a + b, 0) + w.sep * Math.max(0, n - 1);
  if (total <= available) return null;
  const folders = n - 1;
  // Keep folder 0 and the last two folders (indexes folders-2 and folders-1).
  const start = 1;
  const end = folders - 2;
  return end > start ? [start, end] : null;
}
