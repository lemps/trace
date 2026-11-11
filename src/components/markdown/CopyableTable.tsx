import type { ReactNode } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { SplitButton } from "@/components/SplitButton";
import { copyPlain, copyRich } from "@/ipc/clipboard";
import {
  extractTable,
  type TableData,
  type TableHast,
  tableToHtml,
  tableToMarkdown,
  tableToTsv,
} from "./tableExport";
import { useCopied } from "./useCopied";

// A GFM table with a copy control (`SplitButton`) on its top-right corner, shown on
// hover or focus, and held while it says "Copied". The button copies the table for documents and spreadsheets (HTML and
// TSV in one clipboard item: each app takes the richest it reads); its caret
// also offers a Markdown pipe table. The control floats over the table's head
// row, so it never widens the table.

/** HTML for rich editors and TSV for cells, in one clipboard write: each app takes what it reads. */
function writeTable(data: TableData): Promise<void> {
  return copyRich(tableToHtml(data), tableToTsv(data));
}

function TableCopy({ node }: { node: TableHast }) {
  const [copied, flash] = useCopied();
  // Extracted on click, not per render: a streaming reply re-renders its table often.
  const run = (write: (data: TableData) => Promise<void>) => {
    write(extractTable(node)).then(flash, (e) =>
      toast.error(`Couldn't copy the table: ${String(e)}`)
    );
  };
  const copyTable = () => run(writeTable);
  const copyMarkdown = () => run((d) => copyPlain(tableToMarkdown(d)));
  return (
    <SplitButton
      size="xs"
      className={`md-table-copy${copied ? " copied" : ""}`}
      menuLabel="More ways to copy"
      sections={[
        {
          items: [
            { label: "Copy table", detail: "For docs and spreadsheets", onSelect: copyTable },
            { label: "Copy as Markdown", onSelect: copyMarkdown },
          ],
        },
      ]}
    >
      <IconButton size="xs" label={copied ? "Copied" : "Copy table"} onClick={copyTable}>
        {copied ? <I.Check size={12} /> : <I.Copy size={12} />}
      </IconButton>
    </SplitButton>
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
