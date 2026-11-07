import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Typed wrappers around `commands/plans.rs`: the Plan tab's documents (plans and
// reports an agent produced, with their versions) and its live task list.
// Mirrors `plans::model`.

export type PlanSource = "planMode" | "published";
export type PlanFormat = "markdown" | "html";
export type TaskStatus = "pending" | "inProgress" | "done";

/** One version of a document. Versions of one document share `series`. */
export interface PlanDoc {
  id: string;
  series: string;
  title: string;
  source: PlanSource;
  format: PlanFormat;
  /** Markdown, or raw HTML (only ever rendered in a sandboxed iframe). */
  body: string;
  /** Unix milliseconds. */
  createdAt: number;
  version: number;
}

export interface TaskList {
  items: { text: string; status: TaskStatus }[];
  updatedAt: number;
}

export interface PlanState {
  docs: PlanDoc[];
  tasks: TaskList | null;
}

export function loadPlanDocs(workspaceId: string): Promise<PlanState> {
  return invoke("load_plan_docs", { workspaceId });
}

/** Publish a document; with `replaces` (a document id), as that one's next version. */
export function publishPlanDoc(
  workspaceId: string,
  format: PlanFormat,
  title: string | null,
  body: string,
  replaces: string | null = null
): Promise<PlanDoc> {
  return invoke("publish_plan_doc", { workspaceId, format, title, body, replaces });
}

export function removePlanDoc(
  workspaceId: string,
  id: string,
  allVersions: boolean
): Promise<void> {
  return invoke("remove_plan_doc", { workspaceId, id, allVersions });
}

/** Save a document as `.md` / `.html` where the user picks. Null if they cancelled. */
export function exportPlanDoc(workspaceId: string, id: string): Promise<string | null> {
  return invoke("export_plan_doc", { workspaceId, id });
}

export type PdfExport =
  | { kind: "saved"; path: string }
  | { kind: "cancelled" }
  /** The webview can't write a PDF itself: open the print dialog instead. */
  | { kind: "usePrintDialog" };

/** Print the page (in its print layout) to a PDF the user picks. */
export function exportPlanPdf(title: string): Promise<PdfExport> {
  return invoke("export_plan_pdf", { title });
}

export function onPlanDoc(
  cb: (p: { workspaceId: string; doc: PlanDoc }) => void
): Promise<UnlistenFn> {
  return listen<{ workspaceId: string; doc: PlanDoc }>("plan-doc", (e) => cb(e.payload));
}

export function onPlanTasks(
  cb: (p: { workspaceId: string; tasks: TaskList }) => void
): Promise<UnlistenFn> {
  return listen<{ workspaceId: string; tasks: TaskList }>("plan-tasks", (e) => cb(e.payload));
}
