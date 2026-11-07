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
