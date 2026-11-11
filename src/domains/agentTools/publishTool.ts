import type Anthropic from "@anthropic-ai/sdk";
import { type PlanFormat, publishPlanDoc } from "@/ipc/plans";

// Lets an agent hand the user a document to read: it lands in the calling
// workspace's Plan tab, where the user sees its versions and exports it.

export const PUBLISH_DOCUMENT: Anthropic.Tool = {
  name: "publish_document",
  description:
    "Publish a document for the user to read, review or export: a plan, spec, design, review or report. It opens in this workspace's Plan tab in trace, rendered (Markdown with the chat's styles, or HTML in a sandbox with scripts off), where the user can compare versions, copy it, save it as .md or PDF, or send it back to you. On paper nothing can be clicked or hovered, so give anything interactive (tabs, collapsed sections, hover details) a static reading too. Use it when the user asks for a plan or write-up, or when a long result reads better as a document than as a chat reply. Publishing again with the same title, or with `replaces` set to a document id this tool returned, adds a new version and keeps the old ones. For raw HTML from a shell, `trace-render page.html` does the same.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "The document's title, as the Plan tab lists it." },
      content: {
        type: "string",
        description: "The document: Markdown (GitHub-flavoured), or HTML.",
      },
      format: {
        type: "string",
        enum: ["markdown", "html"],
        description: "How `content` is written. Defaults to markdown.",
      },
      replaces: {
        type: "string",
        description:
          "Optional: the id of a document published earlier, to post this as its next version.",
      },
    },
    required: ["title", "content"],
  },
};

/** Run `publish_document` for the agent that called it. */
export async function runPublishDocument(input: unknown, caller: string): Promise<string> {
  const args = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");
  const title = str("title").trim();
  const content = str("content");
  const format: PlanFormat = str("format") === "html" ? "html" : "markdown";
  if (!caller) throw new Error("trace couldn't tell which agent this document is from.");
  if (!title) throw new Error("Give the document a title.");
  if (!content.trim()) throw new Error("The document is empty.");
  const doc = await publishPlanDoc(caller, format, title, content, str("replaces") || null);
  return `Published "${doc.title}" (version ${doc.version}, id ${doc.id}) to the Plan tab. To post a new version, publish again with the same title or with replaces: "${doc.id}".`;
}
