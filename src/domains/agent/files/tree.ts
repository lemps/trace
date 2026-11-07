import type { ChangeKind } from "../../../ipc/diff.ts";
import { toTreePath } from "./filePaths.ts";

// The Files tab's tree, built once from a flat path list (git's `ls-files`, or the
// changed paths) so expanding a folder or filtering never re-reads 100k strings.
// Pure, so it's tested on its own.

/** What changed about a file, from the diff summary. */
export interface Change {
  status: ChangeKind;
  add: number;
  del: number;
  oldPath?: string;
}

export interface FileNode {
  kind: "file";
  name: string;
  /** Relative to the worktree, `/`-separated. */
  path: string;
  /** `name` lower-cased, for filtering and type-to-jump without re-lowering per keystroke. */
  lower: string;
  change?: Change;
}

export interface DirNode {
  kind: "dir";
  name: string;
  /** "" for the root. */
  path: string;
  lower: string;
  children: TreeNode[];
  /** Changed files anywhere below. */
  changed: number;
  /** Their one status, or "modified" when they differ; null when nothing below changed. */
  rollup: ChangeKind | null;
  add: number;
  del: number;
}

export type TreeNode = FileNode | DirNode;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Folders first, then names in natural order (`file2` before `file10`). */
export function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

const isNew = (k: ChangeKind) => k === "added" || k === "untracked";

/** Two statuses seen under one folder, as the one the folder shows. */
export function mergeStatus(a: ChangeKind | null, b: ChangeKind): ChangeKind {
  if (a === null || a === b) return b;
  if (isNew(a) && isNew(b)) return "added";
  return "modified";
}

function dir(name: string, path: string): DirNode {
  return {
    kind: "dir",
    name,
    path,
    lower: name.toLowerCase(),
    children: [],
    changed: 0,
    rollup: null,
    add: 0,
    del: 0,
  };
}

/**
 * The tree of `paths` (any separator; duplicates are listed once), with each file's
 * change from `changes` (keyed by tree path) and every folder's roll-up of the
 * changes below it. Changed paths missing from `paths` (a deleted file) are added.
 */
export function buildTree(paths: Iterable<string>, changes: ReadonlyMap<string, Change>): DirNode {
  const root = dir("", "");
  const dirs = new Map<string, DirNode>([["", root]]);
  const seen = new Set<string>();

  const dirFor = (path: string): DirNode => {
    const found = dirs.get(path);
    if (found) return found;
    const cut = path.lastIndexOf("/");
    const node = dir(path.slice(cut + 1), path);
    dirFor(cut < 0 ? "" : path.slice(0, cut)).children.push(node);
    dirs.set(path, node);
    return node;
  };

  const add = (raw: string) => {
    const path = toTreePath(raw);
    if (!path || seen.has(path)) return;
    seen.add(path);
    const cut = path.lastIndexOf("/");
    const name = path.slice(cut + 1);
    const change = changes.get(path);
    const file: FileNode = { kind: "file", name, path, lower: name.toLowerCase() };
    if (change) file.change = change;
    dirFor(cut < 0 ? "" : path.slice(0, cut)).children.push(file);
  };

  for (const p of paths) add(p);
  for (const p of changes.keys()) add(p);
  finish(root);
  return root;
}

/** Sort every folder and roll its changes up, children first. */
function finish(node: DirNode): void {
  node.children.sort(compareNodes);
  for (const child of node.children) {
    if (child.kind === "dir") {
      finish(child);
      if (child.changed === 0 || child.rollup === null) continue;
      node.changed += child.changed;
      node.add += child.add;
      node.del += child.del;
      node.rollup = mergeStatus(node.rollup, child.rollup);
    } else if (child.change) {
      node.changed += 1;
      node.add += child.change.add;
      node.del += child.change.del;
      node.rollup = mergeStatus(node.rollup, child.change.status);
    }
  }
}

/** The changes keyed by tree path, for `buildTree`. */
export function changeMap(
  files: readonly { path: string; status: ChangeKind; add: number; del: number; oldPath?: string }[]
): Map<string, Change> {
  const map = new Map<string, Change>();
  for (const f of files) {
    const change: Change = { status: f.status, add: f.add, del: f.del };
    if (f.oldPath) change.oldPath = toTreePath(f.oldPath);
    map.set(toTreePath(f.path), change);
  }
  return map;
}

/** The node at `path` ("" is the root), or null. */
export function findNode(root: DirNode, path: string): TreeNode | null {
  const target = toTreePath(path);
  if (!target) return root;
  let node: DirNode = root;
  let at = 0;
  for (;;) {
    const cut = target.indexOf("/", at);
    const prefix = cut < 0 ? target : target.slice(0, cut);
    const isLast = cut < 0;
    const next: TreeNode | undefined = node.children.find(
      (c) => c.path === prefix && (isLast || c.kind === "dir")
    );
    if (!next) return null;
    if (isLast) return next;
    if (next.kind !== "dir") return null;
    node = next;
    at = cut + 1;
  }
}
