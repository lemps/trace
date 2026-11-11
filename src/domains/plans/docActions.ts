import { toast } from "@/app/toast";
import type { MenuSection } from "@/components/PopMenu";
import { copyText } from "@/domains/agent/copyText";
import { exportPlanDoc, type PlanDoc } from "@/ipc/plans";
import type { PrintPdf } from "./usePrintPdf";

interface DocActionsArgs {
  workspaceId: string;
  doc: PlanDoc;
  versions: number;
  print: PrintPdf;
  /** Put text in front of the agent, unsent. */
  sendToAgent: (text: string) => Promise<unknown>;
  askRemove: (what: "version" | "all") => void;
}

/** The document as context for the agent: what it is, then its text. */
export function asContext(doc: PlanDoc): string {
  const kind = doc.format === "html" ? "HTML document" : "plan";
  const fence = doc.format === "html" ? "```html\n" : "";
  const close = doc.format === "html" ? "\n```" : "";
  return `Here is the ${kind} “${doc.title}” (v${doc.version}) from trace's Plan tab, for context:\n\n${fence}${doc.body}${close}\n`;
}

// A document's ⋯ menu: copy, save as a file (.md or .html, and PDF), hand it to
// the agent, remove it.
export function docActions(a: DocActionsArgs): MenuSection[] {
  const { doc } = a;
  const md = doc.format === "markdown";
  const save = () =>
    void exportPlanDoc(a.workspaceId, doc.id)
      .then((path) => path && toast.success(`Saved to ${path}`))
      .catch((e) => toast.error(`Couldn't save: ${String(e)}`));
  return [
    {
      title: "Export",
      items: [
        {
          label: md ? "Copy as Markdown" : "Copy as HTML",
          onSelect: () => copyText(doc.body, md ? "Markdown" : "HTML"),
        },
        { label: md ? "Save as .md…" : "Save as .html…", onSelect: save },
        {
          label: "Save as PDF…",
          disabled: a.print.busy,
          onSelect: () => void a.print.run(doc),
        },
      ],
    },
    {
      items: [
        {
          label: "Send to agent as context",
          title: "Puts it in the agent's message box, to add to and send yourself",
          onSelect: () => void a.sendToAgent(asContext(doc)),
        },
      ],
    },
    {
      items: [
        ...(a.versions > 1
          ? [
              {
                label: `Remove version ${doc.version}`,
                // Permanent, like removing the whole document.
                danger: true,
                onSelect: () => a.askRemove("version"),
              },
            ]
          : []),
        {
          label: a.versions > 1 ? "Remove document" : "Remove",
          danger: true,
          onSelect: () => a.askRemove("all"),
        },
      ],
    },
  ];
}
