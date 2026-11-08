// Run: `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import {
  extractTable,
  type TableHast,
  tableToHtml,
  tableToMarkdown,
  tableToTsv,
} from "./tableExport.ts";

// The same pipeline react-markdown runs, so the hast is what `table` receives.
const pipeline = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);

function tableOf(markdown: string): TableHast {
  const root = pipeline.runSync(pipeline.parse(markdown)) as TableHast;
  const table = root.children?.find((c) => c.type === "element" && c.tagName === "table");
  assert.ok(table, "the Markdown has a table");
  return table;
}

const BASIC = `
| Name | Age |
| ---- | --: |
| Ada  | 36  |
| Alan | 41  |
`;

describe("extractTable", () => {
  it("reads headers, rows and alignment", () => {
    const t = extractTable(tableOf(BASIC));
    assert.deepEqual(
      t.headers.map((c) => c.text),
      ["Name", "Age"]
    );
    assert.deepEqual(
      t.rows.map((r) => r.map((c) => c.text)),
      [
        ["Ada", "36"],
        ["Alan", "41"],
      ]
    );
    assert.deepEqual(t.align, [null, "right"]);
  });

  it("keeps inline code and link text, without their marks", () => {
    const t = extractTable(
      tableOf("| File | Docs |\n| - | - |\n| `src/a.ts` | [guide](https://x.dev) **now** |")
    );
    assert.deepEqual(
      t.rows[0]?.map((c) => c.text),
      ["src/a.ts", "guide now"]
    );
    assert.equal(t.rows[0]?.[0]?.html, "<code>src/a.ts</code>");
    assert.equal(t.rows[0]?.[1]?.html, '<a href="https://x.dev">guide</a> <strong>now</strong>');
  });

  it("pads short rows to the table's width", () => {
    const t = extractTable(tableOf("| a | b | c |\n| - | - | - |\n| 1 |"));
    assert.deepEqual(
      t.rows[0]?.map((c) => c.text),
      ["1", "", ""]
    );
  });

  it("handles a table with a head and no body", () => {
    const t = extractTable(tableOf("| a | b |\n| - | - |"));
    assert.equal(t.rows.length, 0);
    assert.equal(tableToHtml(t), "<table><thead><tr><th>a</th><th>b</th></tr></thead></table>");
  });
});

describe("tableToTsv", () => {
  it("joins cells with tabs and rows with newlines", () => {
    assert.equal(tableToTsv(extractTable(tableOf(BASIC))), "Name\tAge\nAda\t36\nAlan\t41");
  });

  it("keeps a tab or line break inside a cell from splitting it", () => {
    const t = {
      headers: [{ text: "a\tb", html: "" }],
      rows: [[{ text: "one\ntwo\r\nthree", html: "" }]],
      align: [null],
    };
    assert.equal(tableToTsv(t), "a b\none two three");
  });
});

describe("tableToMarkdown", () => {
  it("writes a pipe table with the source's alignment", () => {
    assert.equal(
      tableToMarkdown(extractTable(tableOf(BASIC))),
      "| Name | Age |\n| --- | ---: |\n| Ada | 36 |\n| Alan | 41 |"
    );
  });

  it("escapes pipes inside cells", () => {
    const t = extractTable(tableOf("| Op | Means |\n| :-: | :- |\n| `a \\| b` | or |"));
    assert.equal(tableToMarkdown(t), "| Op | Means |\n| :---: | :--- |\n| a \\| b | or |");
  });
});

describe("tableToHtml", () => {
  it("writes a bare table, escaping text", () => {
    const t = extractTable(tableOf('| x | y |\n| - | :-: |\n| 1 < 2 & "q" | 2 |'));
    assert.equal(
      tableToHtml(t),
      '<table><thead><tr><th>x</th><th style="text-align:center">y</th></tr></thead>' +
        '<tbody><tr><td>1 &lt; 2 &amp; &quot;q&quot;</td><td style="text-align:center">2</td></tr></tbody></table>'
    );
  });

  it("drops links that aren't web or mail", () => {
    const t = extractTable(tableOf("| a |\n| - |\n| [x](javascript:alert(1)) |"));
    assert.equal(t.rows[0]?.[0]?.html, "x");
  });
});
