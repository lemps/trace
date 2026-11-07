import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type { DiffSummary } from "@/ipc/diff";
import type { WorktreeFiles } from "@/ipc/files";
import type { TreeFocus } from "./FileTree";
import { ancestorsOf } from "./filePaths";
import {
  type Filtered,
  filterTree,
  flatFiles,
  type Query,
  type Row,
  toQuery,
  visibleRows,
} from "./rows";
import { type FilesMode, type FilesView, withKey } from "./store";
import { buildTree, type Change, changeMap, type DirNode, findNode } from "./tree";

export interface TreeState {
  mode: FilesMode;
  changes: Map<string, Change>;
  /** The tree for the current mode; null while its list loads. */
  tree: DirNode | null;
  filtered: Filtered | null;
  query: Query | null;
  rows: Row[];
  isOpen: (dir: DirNode) => boolean;
  /** Open or close folders together (a compact chain is one row). */
  toggle: (dirs: DirNode[], open: boolean) => void;
  /**
   * Show `path` in the tree: switch to a mode that has it and open its folders (and
   * it, for a folder — `isDir` says which when the tree holding it hasn't loaded).
   */
  reveal: (path: string, isDir?: boolean) => void;
  focus: TreeFocus | null;
  /** The tree has shown `focus`: forget it, so a remounted tree doesn't jump back. */
  clearFocus: () => void;
  /** The first changed file in tree order, to open when nothing is. */
  firstChange: string | null;
  /** Whether `path` is still in the worktree (unknown, so true, until the lists load). */
  exists: (path: string) => boolean;
}

let focusNonce = 0;

/**
 * The tree the Files sidebar shows, from the loaded lists and the remembered view:
 * which mode, which folders are open (filtering opens the folders of its matches,
 * until the user closes one), and the rows that leaves on screen.
 */
export function useTreeState(
  mode: FilesMode,
  summary: DiffSummary | null,
  all: WorktreeFiles | null,
  view: FilesView,
  patch: (p: Partial<FilesView>) => void
): TreeState {
  const changes = useMemo(() => changeMap(summary?.files ?? []), [summary]);
  const changesTree = useMemo(() => buildTree([], changes), [changes]);
  const allTree = useMemo(() => (all ? buildTree(all.files, changes) : null), [all, changes]);
  const tree = mode === "changes" ? (summary ? changesTree : null) : allTree;
  const firstChange = useMemo(
    () =>
      visibleRows(changesTree, () => true).find((r) => r.node.kind === "file")?.node.path ?? null,
    [changesTree]
  );

  // Filtering 100k names takes a moment: let typing stay ahead of it.
  const filterText = useDeferredValue(view.filter);
  const query = useMemo(() => toQuery(filterText), [filterText]);
  const filtered = useMemo(() => (tree && query ? filterTree(tree, query) : null), [tree, query]);
  // While filtering, folders the user opens or closes, over the filter's own choice.
  // Dropped when the filter text changes (not when a refresh rebuilds the tree).
  const [override, setOverride] = useState<{ key: string; open: Map<string, boolean> }>({
    key: "",
    open: new Map(),
  });
  const overrides = override.key === filterText ? override.open : null;

  const { changesClosed, allOpen, flat } = view;
  const isOpen = useCallback(
    (dir: DirNode) => {
      if (filtered) return overrides?.get(dir.path) ?? filtered.open.has(dir.path);
      return mode === "changes" ? !changesClosed.has(dir.path) : allOpen.has(dir.path);
    },
    [filtered, overrides, mode, changesClosed, allOpen]
  );

  const root = filtered?.root ?? tree;
  const rows = useMemo(() => {
    if (!root) return [];
    if (mode === "changes" && flat) return flatFiles(root);
    const matched = filtered?.matchedDirs;
    return visibleRows(root, isOpen, matched ? (d) => matched.has(d.path) : undefined);
  }, [root, mode, flat, isOpen, filtered]);

  const toggle = useCallback(
    (dirs: DirNode[], open: boolean) => {
      if (filtered) {
        const next = new Map(overrides ?? []);
        for (const d of dirs) next.set(d.path, open);
        setOverride({ key: filterText, open: next });
      } else if (mode === "changes") {
        let closed: ReadonlySet<string> = changesClosed;
        for (const d of dirs) closed = withKey(closed, d.path, !open);
        patch({ changesClosed: closed });
      } else {
        let opened: ReadonlySet<string> = allOpen;
        for (const d of dirs) opened = withKey(opened, d.path, open);
        patch({ allOpen: opened });
      }
    },
    [filtered, filterText, overrides, mode, changesClosed, allOpen, patch]
  );

  const [focus, setFocus] = useState<TreeFocus | null>(null);
  const reveal = useCallback(
    (path: string, isDir?: boolean) => {
      const inChanges = findNode(changesTree, path) !== null;
      const target: FilesMode = mode === "changes" && inChanges ? "changes" : "all";
      const node = findNode(target === "changes" ? changesTree : (allTree ?? changesTree), path);
      const isFolder = isDir ?? node?.kind === "dir";
      const folders = ancestorsOf(path);
      if (isFolder) folders.push(path);
      const p: Partial<FilesView> = { mode: target, filter: "" };
      if (target === "changes") {
        let closed: ReadonlySet<string> = changesClosed;
        for (const f of folders) closed = withKey(closed, f, false);
        p.changesClosed = closed;
        // A folder isn't a row in the flat list: show the tree to reveal one.
        if (isFolder) p.flat = false;
      } else {
        let open: ReadonlySet<string> = allOpen;
        for (const f of folders) open = withKey(open, f, true);
        p.allOpen = open;
      }
      patch(p);
      focusNonce += 1;
      setFocus({ path, nonce: focusNonce });
    },
    [changesTree, allTree, mode, changesClosed, allOpen, patch]
  );

  const clearFocus = useCallback(() => setFocus(null), []);

  const exists = useCallback(
    (path: string) => {
      if (changes.has(path)) return true;
      if (!allTree) return true;
      return findNode(allTree, path) !== null;
    },
    [changes, allTree]
  );

  return {
    mode,
    changes,
    tree,
    filtered,
    query,
    rows,
    isOpen,
    toggle,
    reveal,
    focus,
    clearFocus,
    firstChange,
    exists,
  };
}
