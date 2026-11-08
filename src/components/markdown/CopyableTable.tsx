import type { ReactNode } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { PopMenu } from "@/components/PopMenu";
import {
  extractTable,
  type TableData,
  type TableHast,
  tableToHtml,
  tableToMarkdown,
  tableToTsv,
} from "./tableExport";
import { useCopied } from "./useCopied";

// A GFM table with a copy control on its top-right corner, shown on hover or
// focus. The button copies the table for documents and spreadsheets (HTML and
// TSV in one clipboard item: each app takes the richest it reads); its caret
// also offers a Markdown pipe table. The control floats over the table's head
// row, so it never widens the table.

/** HTML for rich editors and TSV for cells, or TSV alone where HTML can't be written. */
async function writeTable(data: TableData): Promise<void> {
  const tsv = tableToTsv(data);
  const canHtml =
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard.write === "function" &&
    (!("supports" in ClipboardItem) || ClipboardItem.supports("text/html"));
  if (canHtml) {
    try {
      const item = new ClipboardItem({
        "text/html": new Blob([tableToHtml(data)], { type: "text/html" }),
        "text/plain": new Blob([tsv], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      return;
    } catch {
      // Fall back to the text alone, below.
    }
  }
  await navigator.clipboard.writeText(tsv);
}

function TableCopy({ node }: { node: TableHast }) {
  const [copied, flash] = useCopied();
  // Extracted on click, not per render: a streaming reply re-renders its table often.
  const run = (write: (data: TableData) => Promise<void>) => {
    write(extractTable(node)).then(flash, () => toast.error("Couldn't copy the table"));
  };
  const copyTable = () => run(writeTable);
  const copyMarkdown = () => run((d) => navigator.clipboard.writeText(tableToMarkdown(d)));
  return (
    <div className="md-table-copy">
      <button
        type="button"
        className="md-table-copy-main"
        aria-label={copied ? "Copied" : "Copy table"}
        title={copied ? "Copied" : "Copy table"}
        onClick={copyTable}
      >
        {copied ? <I.Check size={12} /> : <I.Copy size={12} />}
      </button>
      <PopMenu
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className="md-table-copy-caret"
            aria-label="More ways to copy"
            aria-haspopup="menu"
            aria-expanded={open}
            title="More ways to copy"
            onClick={toggle}
          >
            <I.Chevron size={10} />
          </button>
        )}
        sections={[
          {
            items: [
              { label: "Copy table", detail: "For docs and spreadsheets", onSelect: copyTable },
              { label: "Copy as Markdown", onSelect: copyMarkdown },
            ],
          },
        ]}
      />
    </div>
  );
}

/** The `table` renderer for `<Markdown>`. */
export function CopyableTable({ node, children }: { node?: TableHast; children?: ReactNode }) {
  return (
    <div className="md-table">
      <table>{children}</table>
      {node && <TableCopy node={node} />}
    </div>
  );
}
