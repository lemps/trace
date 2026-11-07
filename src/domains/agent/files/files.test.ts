import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChangeKind } from "../../../ipc/diff.ts";
import { joinNative, worktreeRelative } from "../../../platform/paths.ts";
import { ancestorsOf, collapseCrumbs, crumbsOf, parentOf, toTreePath } from "./filePaths.ts";
import {
  filterTree,
  flatFiles,
  jumpTo,
  matchIn,
  type Row,
  rowOpen,
  toQuery,
  treeKey,
  visibleRows,
} from "./rows.ts";
import { buildTree, changeMap, type DirNode, findNode, type TreeNode } from "./tree.ts";

const change = (path: string, status: ChangeKind, add = 1, del = 0) => ({ path, status, add, del });
const names = (dir: DirNode) => dir.children.map((c) => c.name);
const dirAt = (root: DirNode, path: string) => {
  const node = findNode(root, path);
  assert.ok(node && node.kind === "dir", `${path} is a folder`);
  return node;
};
const allOpen = () => true;
const paths = (rows: { node: TreeNode }[]) => rows.map((r) => r.node.path);
const chainOf = (row: Row | undefined) => row?.chain?.map((d) => d.path);

describe("buildTree", () => {
  it("nests paths into folders, folders first, in natural order", () => {
    const root = buildTree(
      ["src/b.ts", "README.md", "src/a/x.ts", "src/file10.ts", "src/file2.ts"],
      new Map()
    );
    assert.deepEqual(names(root), ["src", "README.md"]);
    assert.deepEqual(names(dirAt(root, "src")), ["a", "b.ts", "file2.ts", "file10.ts"]);
    assert.equal(findNode(root, "src/a/x.ts")?.kind, "file");
  });

  it("lists a path once, however it was written", () => {
    const root = buildTree(["src/a.ts", "./src/a.ts", "src//a.ts", "src/a.ts/"], new Map());
    assert.deepEqual(names(dirAt(root, "src")), ["a.ts"]);
  });

  it("adds changed paths the list lacks (a deleted file)", () => {
    const root = buildTree(["a.ts"], changeMap([change("gone/b.ts", "deleted", 0, 9)]));
    const gone = findNode(root, "gone/b.ts");
    assert.equal(gone?.kind === "file" && gone.change?.status, "deleted");
  });

  it("keeps a renamed file's old path", () => {
    const root = buildTree([], changeMap([{ ...change("new.ts", "renamed"), oldPath: "old.ts" }]));
    const node = findNode(root, "new.ts");
    assert.equal(node?.kind === "file" && node.change?.oldPath, "old.ts");
  });
});

describe("status roll-up", () => {
  const root = buildTree(
    ["src/a/one.ts", "src/a/two.ts", "src/b/three.ts", "src/c/four.ts", "docs/x.md"],
    changeMap([
      change("src/a/one.ts", "added", 10),
      change("src/a/two.ts", "untracked", 5),
      change("src/b/three.ts", "deleted", 0, 7),
      change("docs/x.md", "modified", 2, 2),
    ])
  );

  it("counts changed files and lines in every folder above them", () => {
    const src = dirAt(root, "src");
    assert.equal(src.changed, 3);
    assert.equal(src.add, 15);
    assert.equal(src.del, 7);
    assert.equal(root.changed, 4);
    assert.equal(dirAt(root, "src/c").changed, 0);
    assert.equal(dirAt(root, "src/c").rollup, null);
  });

  it("shows one status when they agree, new files as added, else modified", () => {
    assert.equal(dirAt(root, "src/a").rollup, "added");
    assert.equal(dirAt(root, "src/b").rollup, "deleted");
    assert.equal(dirAt(root, "src").rollup, "modified");
  });
});

describe("rows", () => {
  const root = buildTree(["a/b/c.ts", "a/d.ts", "e.ts"], new Map());

  it("shows only what's under open folders", () => {
    assert.deepEqual(paths(visibleRows(root, () => false)), ["a", "e.ts"]);
    const rows = visibleRows(root, allOpen);
    assert.deepEqual(paths(rows), ["a", "a/b", "a/b/c.ts", "a/d.ts", "e.ts"]);
    assert.deepEqual(
      rows.map((r) => r.depth),
      [0, 1, 2, 1, 0]
    );
  });

  it("lists every file flat, by path", () => {
    assert.deepEqual(paths(flatFiles(root)), ["a/b/c.ts", "a/d.ts", "e.ts"]);
  });
});

describe("filterTree", () => {
  const root = buildTree(
    [
      "src/components/Button.tsx",
      "src/domains/agent/FilesPane.tsx",
      "src/main.tsx",
      "docs/files.md",
    ],
    new Map()
  );
  const filter = (q: string) => {
    const query = toQuery(q);
    assert.ok(query);
    return filterTree(root, query);
  };

  it("narrows to matching names, keeping their folders open", () => {
    const f = filter("files");
    const rows = visibleRows(f.root, (d) => f.open.has(d.path));
    // src holds only domains, domains only agent: one compact row.
    assert.deepEqual(paths(rows), [
      "docs",
      "docs/files.md",
      "src/domains/agent",
      "src/domains/agent/FilesPane.tsx",
    ]);
    assert.equal(f.hits, 2);
  });

  it("keeps a folder whose name matches whole, but closed", () => {
    const f = filter("COMPONENTS");
    const rows = visibleRows(
      f.root,
      (d) => f.open.has(d.path),
      (d) => f.matchedDirs.has(d.path)
    );
    // src then holds only components: one row, `src / components`, still closed.
    assert.deepEqual(paths(rows), ["src/components"]);
    assert.deepEqual(chainOf(rows[0]), ["src", "src/components"]);
    assert.equal(
      rowOpen(rows[0], (d) => f.open.has(d.path)),
      false
    );
    assert.equal(f.hits, 1);
    assert.equal(dirAt(f.root, "src/components").children.length, 1);
  });

  it("matches the path when the query has a slash", () => {
    const f = filter("agent/files");
    assert.equal(f.hits, 1);
    assert.ok(findNode(f.root, "src/domains/agent/FilesPane.tsx"));
    const node = findNode(root, "src/domains/agent/FilesPane.tsx");
    assert.ok(node);
    assert.deepEqual(matchIn(node, toQuery("agent/files")), [0, 5]);
  });

  it("finds nothing for a miss, and ignores a blank query", () => {
    assert.equal(filter("zzz").root.children.length, 0);
    assert.equal(toQuery("   "), null);
  });
});

describe("compact folder chains", () => {
  const root = buildTree(
    ["src/domains/agent/a.ts", "src/domains/agent/b.ts", "src/x/y/z.ts", "top.ts"],
    new Map()
  );

  it("draws single-folder folders as one row, ending at a folder with several children", () => {
    const rows = visibleRows(root, allOpen);
    assert.deepEqual(paths(rows), [
      "src",
      "src/domains/agent",
      "src/domains/agent/a.ts",
      "src/domains/agent/b.ts",
      "src/x/y",
      "src/x/y/z.ts",
      "top.ts",
    ]);
    assert.deepEqual(chainOf(rows[1]), ["src/domains", "src/domains/agent"]);
    assert.equal(rows[0].chain, undefined);
    assert.equal(rows[2].depth, 2);
  });

  it("opens and closes a chain as one", () => {
    const open = new Set(["src", "src/domains"]);
    const isOpen = (d: DirNode) => open.has(d.path);
    const rows = visibleRows(root, isOpen);
    const chain = rows.find((r) => r.node.path === "src/domains/agent");
    assert.ok(chain);
    assert.equal(rowOpen(chain, isOpen), false);
    const i = rows.indexOf(chain);
    const action = treeKey(rows, i, "ArrowRight", isOpen);
    assert.ok(action?.kind === "toggle" && action.open);
    assert.deepEqual(
      action.dirs.map((d) => d.path),
      ["src/domains", "src/domains/agent"]
    );
  });

  it("is broken up by a filter match", () => {
    const tree = buildTree(["a/b/c/d.ts", "a/b/c/e.ts"], new Map());
    assert.deepEqual(chainOf(visibleRows(tree, allOpen)[0]), ["a", "a/b", "a/b/c"]);
    const query = toQuery("b");
    assert.ok(query);
    const f = filterTree(tree, query);
    const rows = visibleRows(f.root, allOpen, (d) => f.matchedDirs.has(d.path));
    // The chain stops at the folder the filter matched; what's inside follows it.
    assert.deepEqual(chainOf(rows[0]), ["a", "a/b"]);
    assert.equal(rows[1].node.path, "a/b/c");
  });

  it("jumps by a chain's first folder", () => {
    const rows = visibleRows(root, allOpen);
    // "x / y" is found by x, not by y.
    assert.equal(rows[jumpTo(rows, 0, "x")].node.path, "src/x/y");
    assert.equal(jumpTo(rows, 0, "y"), -1);
    assert.equal(rows[jumpTo(rows, 0, "src")].node.path, "src");
  });
});

describe("treeKey", () => {
  const root = buildTree(["a/b/c.ts", "a/d.ts", "e.ts"], new Map());
  const open = new Set(["a"]);
  const isOpen = (d: DirNode) => open.has(d.path);
  const rows = visibleRows(root, isOpen); // a, a/b, a/d.ts, e.ts

  it("moves, clamped to the list", () => {
    assert.deepEqual(treeKey(rows, 0, "ArrowDown", isOpen), { kind: "move", to: 1 });
    assert.deepEqual(treeKey(rows, 0, "ArrowUp", isOpen), { kind: "move", to: 0 });
    assert.deepEqual(treeKey(rows, 1, "End", isOpen), { kind: "move", to: 3 });
    assert.deepEqual(treeKey(rows, -1, "ArrowDown", isOpen), { kind: "move", to: 0 });
  });

  it("opens and steps into folders with Right, closes and steps out with Left", () => {
    assert.equal(treeKey(rows, 1, "ArrowRight", isOpen)?.kind, "toggle");
    assert.deepEqual(treeKey(rows, 0, "ArrowRight", isOpen), { kind: "move", to: 1 });
    assert.deepEqual(treeKey(rows, 2, "ArrowLeft", isOpen), { kind: "move", to: 0 });
    const close = treeKey(rows, 0, "ArrowLeft", isOpen);
    assert.ok(close?.kind === "toggle" && !close.open);
  });

  it("opens a file on Enter", () => {
    const action = treeKey(rows, 3, "Enter", isOpen);
    assert.ok(action?.kind === "open" && action.file.path === "e.ts");
  });
});

describe("jumpTo", () => {
  const root = buildTree(["src.ts", "scripts.ts", "styles.css", "lib.ts"], new Map());
  const rows = visibleRows(root, allOpen); // lib, scripts, src, styles

  it("finds the next name with the typed prefix, wrapping", () => {
    assert.equal(rows[jumpTo(rows, 0, "s")].node.name, "scripts.ts");
    assert.equal(rows[jumpTo(rows, 1, "sr")].node.name, "src.ts");
    assert.equal(rows[jumpTo(rows, 3, "l")].node.name, "lib.ts");
    assert.equal(jumpTo(rows, 0, "q"), -1);
  });

  it("cycles one letter's rows when it's typed again", () => {
    assert.equal(rows[jumpTo(rows, 1, "ss")].node.name, "src.ts");
  });
});

describe("paths", () => {
  it("keys every form of a relative path the same", () => {
    assert.equal(toTreePath("./src//a.ts/"), "src/a.ts");
    assert.deepEqual(ancestorsOf("a/b/c.ts"), ["a", "a/b"]);
    assert.equal(parentOf("a/b/c.ts"), "a/b");
    assert.equal(parentOf("c.ts"), "");
    assert.deepEqual(crumbsOf("a/b.ts"), [
      { name: "a", path: "a" },
      { name: "b.ts", path: "a/b.ts" },
    ]);
  });

  it("treats a backslash as a separator only on Windows", () => {
    assert.equal(worktreeRelative("src\\a\\b.ts", "windows"), "src/a/b.ts");
    assert.equal(worktreeRelative("odd\\name.ts", "linux"), "odd\\name.ts");
  });

  it("joins a worktree path in the OS's own separators", () => {
    assert.equal(joinNative("C:/wt/trace/", "src/a.ts", "windows"), "C:\\wt\\trace\\src\\a.ts");
    assert.equal(joinNative("C:\\wt\\trace", "src/a.ts", "windows"), "C:\\wt\\trace\\src\\a.ts");
    assert.equal(joinNative("/home/me/wt", "src/a.ts", "macos"), "/home/me/wt/src/a.ts");
  });

  it("builds 100k paths quickly", () => {
    const many: string[] = [];
    for (let i = 0; i < 100_000; i++) many.push(`pkg${i % 50}/mod${i % 400}/file${i}.ts`);
    const t = performance.now();
    const root = buildTree(many, new Map());
    const rows = visibleRows(root, allOpen);
    const elapsed = performance.now() - t;
    assert.equal(rows.filter((r) => r.node.kind === "file").length, 100_000);
    assert.ok(elapsed < 2000, `took ${elapsed}ms`);
  });
});

describe("collapseCrumbs", () => {
  const w = (crumbs: number[]) => ({ crumbs, sep: 10 });

  it("hides nothing when the crumbs fit", () => {
    // 5 crumbs of 50 + 4 separators = 290.
    assert.equal(collapseCrumbs(w([50, 50, 50, 50, 50]), 290), null);
  });

  it("keeps the first and last two folders, hiding the middle behind one …", () => {
    // src / a / b / c / d / file: folders 0..4, file 5.
    assert.deepEqual(collapseCrumbs(w([30, 40, 40, 40, 40, 200]), 300), [1, 3]);
  });

  it("has nothing to hide with three folders or fewer: the file name shrinks", () => {
    assert.equal(collapseCrumbs(w([30, 40, 40, 500]), 100), null);
    assert.equal(collapseCrumbs(w([800]), 100), null);
  });
});
