// A rendered GFM table, out to the clipboard formats people paste it into:
// TSV (spreadsheet cells), a Markdown pipe table, and a clean HTML <table>
// (Docs, Sheets, Excel, Notion, Slack read it as a real table). It works from
// the hast node react-markdown hands its `table` renderer, so it needs no DOM
// and is tested in isolation (tableExport.test.ts).

/** The part of a hast tree a GFM table is made of: elements and text. */
export interface TableHast {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: readonly TableHast[];
}

export type Align = "left" | "center" | "right" | null;

export interface TableCell {
  /** The cell's text, inline code and link text included, without their marks. */
  text: string;
  /** Its inline formatting as minimal HTML: strong, em, del, code, links. */
  html: string;
}

export interface TableData {
  headers: TableCell[];
  rows: TableCell[][];
  /** Each column's alignment, from the delimiter row (`:---:`). */
  align: Align[];
}

// A pasted table's own lines: rich editors (Notes, Mail, Slack) draw a table
// with no borders unless it says so. Inline, since the paste carries no stylesheet,
// and fixed colours, since it lands outside trace's themes.
export const TABLE_STYLE = "border-collapse:collapse";
export const TABLE_CELL_STYLE = "border:1px solid #d0d7de;padding:4px 8px";

const isEl = (n: TableHast, tag: string) => n.type === "element" && n.tagName === tag;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textOf(n: TableHast): string {
  if (n.type === "text") return n.value ?? "";
  if (isEl(n, "br")) return "\n";
  return (n.children ?? []).map(textOf).join("");
}

/** Inline elements kept in the HTML copy; anything else gives way to its children. */
const KEPT = new Set(["strong", "em", "del", "code"]);

function htmlOf(n: TableHast): string {
  if (n.type === "text") return escapeHtml(n.value ?? "");
  if (n.type !== "element") return "";
  const inner = (n.children ?? []).map(htmlOf).join("");
  const tag = n.tagName ?? "";
  if (tag === "br") return "<br>";
  if (KEPT.has(tag)) return `<${tag}>${inner}</${tag}>`;
  const href = n.properties?.href;
  if (tag === "a" && typeof href === "string" && /^(https?:|mailto:)/i.test(href)) {
    return `<a href="${escapeHtml(href)}">${inner}</a>`;
  }
  return inner;
}

function alignOf(cell: TableHast): Align {
  const a = cell.properties?.align;
  return a === "left" || a === "center" || a === "right" ? a : null;
}

/** Every `tr` under `n`, in order, with whether it's in the table's head. */
function rowsOf(n: TableHast, inHead = false): { cells: TableHast[]; head: boolean }[] {
  if (isEl(n, "tr")) {
    const cells = (n.children ?? []).filter((c) => isEl(c, "th") || isEl(c, "td"));
    return [{ cells, head: inHead }];
  }
  return (n.children ?? []).flatMap((c) => rowsOf(c, inHead || isEl(n, "thead")));
}

/** The headers, rows and column alignment of a rendered table's hast node. */
export function extractTable(node: TableHast): TableData {
  const all = rowsOf(node);
  // GFM always has a head row; a table without one takes its first row.
  const headIndex = Math.max(
    0,
    all.findIndex((r) => r.head)
  );
  const head = all[headIndex]?.cells ?? [];
  const body = all.filter((_, i) => i !== headIndex).map((r) => r.cells);
  const width = Math.max(head.length, ...body.map((r) => r.length));
  const toCells = (cells: TableHast[]): TableCell[] =>
    Array.from({ length: width }, (_, i) => {
      const c = cells[i];
      return c ? { text: textOf(c).trim(), html: htmlOf(c).trim() } : { text: "", html: "" };
    });
  return {
    headers: toCells(head),
    rows: body.map(toCells),
    align: Array.from({ length: width }, (_, i) => {
      const c = head[i] ?? body.find((r) => r[i])?.[i];
      return c ? alignOf(c) : null;
    }),
  };
}

/** One line per cell: tabs and line breaks would split it into more cells or rows. */
const oneLine = (text: string) => text.replace(/[\t\r\n]+/g, " ").trim();

/** Tab-separated values, header first: pastes into spreadsheet cells. */
export function tableToTsv({ headers, rows }: TableData): string {
  return [headers, ...rows].map((r) => r.map((c) => oneLine(c.text)).join("\t")).join("\n");
}

const DELIMITER: Record<string, string> = {
  left: ":---",
  center: ":---:",
  right: "---:",
  none: "---",
};

/** A GFM pipe table, with the source's column alignment. */
export function tableToMarkdown({ headers, rows, align }: TableData): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const cell = (c: TableCell) => oneLine(c.text).replace(/\|/g, "\\|");
  return [
    line(headers.map(cell)),
    line(headers.map((_, i) => DELIMITER[align[i] ?? "none"])),
    ...rows.map((r) => line(r.map(cell))),
  ].join("\n");
}

/** A bare <table>: no classes or styles but alignment, so the paste takes its new home's look. */
export function tableToHtml({ headers, rows, align }: TableData): string {
  const attr = (i: number) =>
    ` style="${TABLE_CELL_STYLE}${align[i] ? `;text-align:${align[i]}` : ""}"`;
  const tr = (cells: TableCell[], tag: "th" | "td") =>
    `<tr>${cells.map((c, i) => `<${tag}${attr(i)}>${c.html}</${tag}>`).join("")}</tr>`;
  const body = rows.length ? `<tbody>${rows.map((r) => tr(r, "td")).join("")}</tbody>` : "";
  return `<table style="${TABLE_STYLE}"><thead>${tr(headers, "th")}</thead>${body}</table>`;
}
