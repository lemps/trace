import type { DirNode, FileNode, TreeNode } from "./tree.ts";

// What the tree draws: its nodes flattened into rows in screen order, so a list of
// 100k files renders (and moves a cursor) as one array, a screenful at a time.

export interface Row {
  /** The file, or the folder whose contents follow (a chain's last folder). */
  node: TreeNode;
  /** 0 for the top level. */
  depth: number;
  /**
   * A compact folder chain, outermost first and ending at `node`: folders that each
   * hold just one folder, drawn on one row as `src / domains / agent` (as VS Code does).
   */
  chain?: DirNode[];
}

/** The folders a row stands for: its chain, or its one folder. */
export function rowDirs(row: Row): DirNode[] {
  if (row.chain) return row.chain;
  return row.node.kind === "dir" ? [row.node] : [];
}

/** A folder row is open when every folder in it is: a chain opens and closes as one. */
export function rowOpen(row: Row, isOpen: (dir: DirNode) => boolean): boolean {
  const dirs = rowDirs(row);
  return dirs.length > 0 && dirs.every(isOpen);
}

/** Whether `row` stands for `path` (any folder of its chain counts). */
export function rowHas(row: Row, path: string): boolean {
  return row.node.path === path || (row.chain?.some((d) => d.path === path) ?? false);
}

/**
 * The rows on screen: every node whose folders are all open, depth-first, with each
 * run of single-folder folders compacted into one row. `endsChain` stops a chain at
 * a folder (one the filter matched by name stays its own last segment).
 */
export function visibleRows(
  root: DirNode,
  isOpen: (dir: DirNode) => boolean,
  endsChain: (dir: DirNode) => boolean = () => false
): Row[] {
  const rows: Row[] = [];
  const walk = (dir: DirNode, depth: number) => {
    for (const node of dir.children) {
      if (node.kind === "file") {
        rows.push({ node, depth });
        continue;
      }
      const chain = [node];
      let last = node;
      while (!endsChain(last) && last.children.length === 1 && last.children[0].kind === "dir") {
        last = last.children[0];
        chain.push(last);
      }
      const row: Row = chain.length > 1 ? { node: last, depth, chain } : { node: last, depth };
      rows.push(row);
      if (chain.every(isOpen)) walk(last, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

/** Every file below `root`, by path: the Changes tab's flat list. */
export function flatFiles(root: DirNode): Row[] {
  const rows: Row[] = [];
  const walk = (dir: DirNode) => {
    for (const node of dir.children) {
      if (node.kind === "dir") walk(node);
      else rows.push({ node, depth: 0 });
    }
  };
  walk(root);
  return rows.sort((a, b) => (a.node.path < b.node.path ? -1 : a.node.path > b.node.path ? 1 : 0));
}

/** A filter query, ready to match: lower-cased and trimmed; `/` in it means "match the path". */
export interface Query {
  text: string;
  byPath: boolean;
}

export function toQuery(raw: string): Query | null {
  const text = raw.trim().toLowerCase();
  return text ? { text, byPath: text.includes("/") } : null;
}

const matches = (node: TreeNode, q: Query) =>
  q.byPath ? node.path.toLowerCase().includes(q.text) : node.lower.includes(q.text);

/** The tree narrowed to a query, plus the folders to open so its matches show. */
export interface Filtered {
  root: DirNode;
  /** Folders holding a match: shown open until the user closes one. */
  open: Set<string>;
  /** Files and folders that matched. */
  hits: number;
  /** Folders kept because their own name matched: each ends a compact chain. */
  matchedDirs: Set<string>;
}

/**
 * `root` narrowed to the files whose name holds the query (or path, for a query
 * with a `/`), keeping the folders they're in. A folder whose own name matches is
 * kept whole and closed, so "components" finds the folder without opening it all.
 */
export function filterTree(root: DirNode, query: Query): Filtered {
  const open = new Set<string>();
  const matchedDirs = new Set<string>();
  let hits = 0;
  const walk = (dir: DirNode): DirNode | null => {
    const kept: TreeNode[] = [];
    for (const child of dir.children) {
      if (child.kind === "file") {
        if (matches(child, query)) {
          kept.push(child);
          hits += 1;
        }
      } else if (!query.byPath && matches(child, query)) {
        kept.push(child);
        matchedDirs.add(child.path);
        hits += 1;
      } else {
        const sub = walk(child);
        if (sub) kept.push(sub);
      }
    }
    if (kept.length === 0) return null;
    open.add(dir.path);
    return { ...dir, children: kept };
  };
  const narrowed = walk(root) ?? { ...root, children: [] };
  return { root: narrowed, open, hits, matchedDirs };
}

/** Where the query sits in `node`'s name, to mark it; null when it doesn't. */
export function matchIn(node: TreeNode, query: Query | null): [number, number] | null {
  if (!query) return null;
  const text = query.byPath ? query.text.slice(query.text.lastIndexOf("/") + 1) : query.text;
  if (!text) return null;
  const at = node.lower.indexOf(text);
  return at < 0 ? null : [at, at + text.length];
}

/** What a key does to the tree: move the cursor, open or close a folder, or open a file. */
export type TreeAction =
  | { kind: "move"; to: number }
  | { kind: "toggle"; dirs: DirNode[]; open: boolean }
  | { kind: "open"; file: FileNode };

/**
 * The tree's arrow-key rules (as in VS Code and the WAI tree pattern): Up/Down move,
 * Home/End jump, Right opens a closed folder or steps into an open one, Left closes
 * an open folder or steps out to the parent, Enter opens a file or toggles a folder.
 * `page` is how many rows PageUp/PageDown move. Null for keys the tree ignores.
 */
export function treeKey(
  rows: readonly Row[],
  cursor: number,
  key: string,
  isOpen: (dir: DirNode) => boolean,
  page = 10
): TreeAction | null {
  if (rows.length === 0) return null;
  const last = rows.length - 1;
  const at = Math.min(Math.max(cursor, 0), last);
  const row = rows[at];
  const move = (to: number): TreeAction => ({ kind: "move", to: Math.min(Math.max(to, 0), last) });
  switch (key) {
    case "ArrowDown":
      return move(cursor < 0 ? 0 : at + 1);
    case "ArrowUp":
      return move(cursor < 0 ? 0 : at - 1);
    case "Home":
      return move(0);
    case "End":
      return move(last);
    case "PageDown":
      return move(at + page);
    case "PageUp":
      return move(at - page);
    case "ArrowRight":
      if (row.node.kind !== "dir") return null;
      if (!rowOpen(row, isOpen)) return { kind: "toggle", dirs: rowDirs(row), open: true };
      return rows[at + 1]?.depth === row.depth + 1 ? move(at + 1) : null;
    case "ArrowLeft": {
      if (row.node.kind === "dir" && rowOpen(row, isOpen)) {
        return { kind: "toggle", dirs: rowDirs(row), open: false };
      }
      for (let i = at - 1; i >= 0; i--) if (rows[i].depth < row.depth) return move(i);
      return null;
    }
    case "Enter":
    case " ":
      return row.node.kind === "dir"
        ? { kind: "toggle", dirs: rowDirs(row), open: !rowOpen(row, isOpen) }
        : { kind: "open", file: row.node };
    default:
      return null;
  }
}

/**
 * Type-to-jump: the next row after `from` (wrapping) whose name starts with
 * `prefix`. A prefix of one repeated letter ("ss") cycles through that letter's
 * rows, as in a file manager. -1 when nothing matches.
 */
export function jumpTo(rows: readonly Row[], from: number, prefix: string): number {
  const p = prefix.toLowerCase();
  if (!p || rows.length === 0) return -1;
  const repeated = p.length > 1 && [...p].every((c) => c === p[0]);
  const want = repeated ? p[0] : p;
  // A longer prefix may still fit the current row; a single letter moves on from it.
  const start = want.length > 1 ? from : from + 1;
  for (let k = 0; k < rows.length; k++) {
    const i = (((start + k) % rows.length) + rows.length) % rows.length;
    const first = rows[i].chain?.[0] ?? rows[i].node;
    if (first.lower.startsWith(want)) return i;
  }
  return -1;
}
