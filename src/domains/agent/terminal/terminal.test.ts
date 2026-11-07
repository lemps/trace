// Run: `npm test` (node's own runner; Node strips the types).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type BufferLike, formatContext, lastLines } from "./contextText.ts";
import { findPaths, resolvePath } from "./paths.ts";
import { type CellBufferLike, linkAt, linksOnLine } from "./rowLinks.ts";

const paths = (text: string) => findPaths(text).map((m) => m.path);

describe("findPaths", () => {
  it("finds relative, dotted and absolute paths", () => {
    assert.deepEqual(paths("edit src/domains/agent/PtyTerminal.tsx now"), [
      "src/domains/agent/PtyTerminal.tsx",
    ]);
    assert.deepEqual(paths("see ./a/b.rs and ../c/d.md"), ["./a/b.rs", "../c/d.md"]);
    assert.deepEqual(paths("/etc/nginx/nginx.conf"), ["/etc/nginx/nginx.conf"]);
    assert.deepEqual(paths(String.raw`C:\Users\me\src\main.rs`), [
      String.raw`C:\Users\me\src\main.rs`,
    ]);
  });
  it("reads a line and column suffix", () => {
    const [m] = findPaths("error at src/lib.rs:42:7: nope");
    assert.equal(m.path, "src/lib.rs");
    assert.equal(m.line, 42);
    assert.equal(m.col, 7);
    assert.equal("error at src/lib.rs:42:7: nope".slice(m.start, m.end), "src/lib.rs:42:7");
  });
  it("takes a bare file name only with a line number", () => {
    assert.deepEqual(paths("main.rs:12"), ["main.rs"]);
    assert.deepEqual(paths("open main.rs please"), []);
  });
  it("leaves out URLs, versions, sentence ends and part-paths", () => {
    assert.deepEqual(paths("https://github.com/org/repo/blob/main/a.ts"), []);
    assert.deepEqual(paths("version 1.2.3 of node"), []);
    assert.deepEqual(paths("look in src/a.ts."), ["src/a.ts"]);
    assert.deepEqual(paths("dir a.b/c"), []);
    assert.deepEqual(paths("e.g. this"), []);
  });
});

describe("resolvePath", () => {
  it("joins relative paths in the cwd's separator", () => {
    assert.equal(resolvePath("/repo/.worktrees/x", "./src/a.ts"), "/repo/.worktrees/x/src/a.ts");
    assert.equal(resolvePath(String.raw`C:\repo`, "src/a.ts"), String.raw`C:\repo\src\a.ts`);
    assert.equal(resolvePath("/repo/sub/", "../a.ts"), "/repo/a.ts");
  });
  it("keeps absolute paths", () => {
    assert.equal(resolvePath("/repo", String.raw`D:\x\y.ts`), String.raw`D:\x\y.ts`);
    assert.equal(resolvePath(String.raw`C:\repo`, "/etc/hosts.txt"), "/etc/hosts.txt");
  });
});

const buffer = (rows: [string, boolean][]): BufferLike => ({
  length: rows.length,
  getLine: (y) =>
    rows[y] && {
      isWrapped: rows[y][1],
      translateToString: (trim) => (trim ? rows[y][0].trimEnd() : rows[y][0]),
    },
});

describe("lastLines", () => {
  it("joins wrapped rows and drops the blank screen below", () => {
    const b = buffer([
      ["one   ", false],
      ["two pa", false],
      ["rt    ", true],
      ["      ", false],
      ["      ", false],
    ]);
    assert.deepEqual(lastLines(b, 10), ["one", "two part"]);
    assert.deepEqual(lastLines(b, 1), ["two part"]);
  });
});

describe("formatContext", () => {
  it("names the source and fences the output", () => {
    const text = formatContext(
      {
        kind: "agent",
        label: "Fix login",
        id: "TRACE-1",
        cwd: "/r/w",
        branch: "workspace/trace-1",
      },
      "a\nb",
      false
    );
    assert.equal(
      text,
      "Terminal output from trace — agent Fix login (TRACE-1)\n" +
        "Working directory: /r/w on branch workspace/trace-1\n" +
        "Last 2 lines:\n```text\na\nb\n```\n"
    );
  });
  it("outgrows backticks inside the output", () => {
    const text = formatContext({ kind: "shell", id: "TRACE-1" }, "````x", true);
    assert.ok(text.includes("`````text\n````x\n`````"));
  });
});

/** A fake cell buffer: each row a string (`＊` stands for a wide character), wrapped or not. */
const cells = (rows: [string, boolean][], cols = 12): CellBufferLike => ({
  getLine: (y) => {
    const row = rows[y];
    if (!row) return undefined;
    const grid: { chars: string; width: number }[] = [];
    for (const ch of row[0]) {
      if (ch === "＊") grid.push({ chars: "漢", width: 2 }, { chars: "", width: 0 });
      else grid.push({ chars: ch, width: 1 });
    }
    while (grid.length < cols) grid.push({ chars: "", width: 1 });
    return {
      isWrapped: row[1],
      length: cols,
      getCell: (x) => grid[x] && { getChars: () => grid[x].chars, getWidth: () => grid[x].width },
    };
  },
});

describe("linksOnLine", () => {
  it("puts a path after wide characters on the right cells", () => {
    const [link] = linksOnLine(cells([["＊＊ a/b.ts", false]]), 0, false);
    assert.equal(link.text, "a/b.ts");
    assert.deepEqual([link.start.x, link.end.x], [5, 10]);
  });
  it("follows a path across a soft wrap", () => {
    const buf = cells([
      ["see src/doma", false],
      ["ins/x.ts ok", true],
    ]);
    for (const y of [0, 1]) {
      const [link] = linksOnLine(buf, y, false);
      assert.equal(link.text, "src/domains/x.ts");
      assert.deepEqual(
        [link.start, link.end],
        [
          { x: 4, y: 0, width: 1 },
          { x: 7, y: 1, width: 1 },
        ]
      );
    }
  });
  it("finds the link under a cell, URLs included, paths inside URLs not", () => {
    const buf = cells([["go https://x.io/a/b.ts now", false]], 30);
    assert.deepEqual(linkAt(buf, 10, 0), { kind: "url", url: "https://x.io/a/b.ts" });
    assert.equal(linkAt(buf, 1, 0), null);
    assert.equal(linksOnLine(buf, 0, false).length, 0);
  });
});
