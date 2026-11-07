import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fuzzyMatch, normalizeQuery, rankFiles } from "./fuzzy.ts";

const top = (query: string, paths: string[]) => rankFiles(query, paths, 10).map((m) => m.path);

describe("fuzzyMatch", () => {
  it("needs every query character, in order", () => {
    assert.equal(fuzzyMatch("abc", "a/b/c.ts")?.path, "a/b/c.ts");
    assert.equal(fuzzyMatch("cba", "a/b/c.ts"), null);
    assert.equal(fuzzyMatch("xyz", "src/main.ts"), null);
  });

  it("ignores case", () => {
    assert.ok(fuzzyMatch("filespane", "src/FilesPane.tsx"));
  });

  it("reports where each character matched", () => {
    const hit = fuzzyMatch("fp", "src/FilesPane.tsx");
    assert.deepEqual(hit?.positions, [4, 9]);
  });

  it("places characters on word starts rather than the first occurrence", () => {
    // The first f and p are in "profile/"; the word starts are F(iles)P(ane).
    const hit = fuzzyMatch("fp", "profile/FilesPane.tsx");
    assert.deepEqual(hit?.positions, [8, 13]);
  });

  it("matches everything for an empty query", () => {
    assert.deepEqual(fuzzyMatch("", "a.ts")?.positions, []);
  });
});

describe("rankFiles", () => {
  it("puts a file-name hit ahead of one spread across folders", () => {
    const paths = ["src/app/store/index.ts", "src/domains/board/appStore.ts"];
    assert.equal(top("appstore", paths)[0], "src/domains/board/appStore.ts");
  });

  it("prefers adjacent letters to scattered ones", () => {
    const paths = ["src/m/a/i/n.ts", "src/main.ts"];
    assert.equal(top("main", paths)[0], "src/main.ts");
  });

  it("prefers word-start initials", () => {
    const paths = ["src/domains/agent/defaults.ts", "src/domains/agent/DetailHeader.tsx"];
    assert.equal(top("dh", paths)[0], "src/domains/agent/DetailHeader.tsx");
  });

  it("prefers the shallower path when matches are otherwise equal", () => {
    const paths = ["deep/nested/folder/readme.md", "readme.md"];
    assert.deepEqual(top("readme", paths), ["readme.md", "deep/nested/folder/readme.md"]);
  });

  it("drops non-matches and honours the limit", () => {
    const paths = ["a.ts", "b.ts", "ab.ts", "c.ts"];
    assert.deepEqual(
      rankFiles("a", paths, 10)
        .map((m) => m.path)
        .sort(),
      ["a.ts", "ab.ts"]
    );
    assert.equal(rankFiles("ts", paths, 2).length, 2);
  });

  it("lists paths as given for an empty query", () => {
    assert.deepEqual(top("  ", ["z.ts", "a.ts"]), ["z.ts", "a.ts"]);
  });

  it("matches folder-qualified queries, with either slash", () => {
    const paths = ["src/ipc/files.ts", "src/domains/files/files.ts"];
    assert.equal(top("ipc/files", paths)[0], "src/ipc/files.ts");
    assert.equal(top("ipc\\files", paths)[0], "src/ipc/files.ts");
  });

  it("ranks a big list quickly", () => {
    const paths = Array.from(
      { length: 100_000 },
      (_, i) => `src/module${i}/part${i % 97}/file${i}.ts`
    );
    const start = performance.now();
    rankFiles("mod5file", paths, 50);
    assert.ok(performance.now() - start < 1500, "ranking 100k paths took too long");
  });
});

describe("normalizeQuery", () => {
  it("lowercases, drops spaces and turns backslashes into slashes", () => {
    assert.equal(normalizeQuery(" Src\\Main TS "), "src/maints");
  });
});
