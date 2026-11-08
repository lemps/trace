import type { PlanDoc, PlanSource, TaskList } from "../../ipc/plans.ts";
import { type DiffLine, diffLines } from "../agentChat/lineDiff.ts";

// The Plan tab's pure rules: documents grouped into their versions, the order
// they list in, when the tab shows at all, and when it has something unseen.

/** One document and all its versions. */
export interface DocSeries {
  series: string;
  /** The newest version: what the list names and opens. */
  latest: PlanDoc;
  /** Oldest first, as v1, v2, … */
  versions: PlanDoc[];
}

export const SOURCE_LABEL: Record<PlanSource, string> = {
  planMode: "Plan mode",
  published: "Published by the agent",
};

/** Documents as series, the most recently updated first. */
export function groupSeries(docs: readonly PlanDoc[]): DocSeries[] {
  const bySeries = new Map<string, PlanDoc[]>();
  for (const d of docs) {
    const list = bySeries.get(d.series);
    if (list) list.push(d);
    else bySeries.set(d.series, [d]);
  }
  const out: DocSeries[] = [];
  for (const [series, list] of bySeries) {
    const versions = [...list].sort((a, b) => a.version - b.version);
    out.push({ series, latest: versions[versions.length - 1], versions });
  }
  return out.sort((a, b) => b.latest.createdAt - a.latest.createdAt);
}

/** What the tab has to show. */
export interface PlanContent {
  docs: number;
  tasks: TaskList | null;
}

/** Whether the Plan tab has content: a document or a task list (panes/coming.ts shows it). */
export function planHasContent(content: PlanContent): boolean {
  return content.docs > 0 || (content.tasks?.items.length ?? 0) > 0;
}

/** Whether a document arrived after the user last looked (`seenAt`, ms; null = never). */
export function hasUnseen(docs: readonly PlanDoc[], seenAt: number | null): boolean {
  if (docs.length === 0) return false;
  const newest = Math.max(...docs.map((d) => d.createdAt));
  return seenAt === null || newest > seenAt;
}

/** The newest document's time, which marks everything up to it seen. */
export function newestAt(docs: readonly PlanDoc[]): number {
  return docs.reduce((m, d) => Math.max(m, d.createdAt), 0);
}

/** The line changes from `from` to `to` (two versions' text). */
export function versionDiff(from: PlanDoc, to: PlanDoc): DiffLine[] {
  return diffLines(from.body, to.body);
}

/** The version shown before `doc` in its series, if any. */
export function previousVersion(s: DocSeries, doc: PlanDoc): PlanDoc | null {
  const i = s.versions.findIndex((v) => v.id === doc.id);
  return i > 0 ? s.versions[i - 1] : null;
}
