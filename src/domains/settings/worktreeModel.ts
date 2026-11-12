import type { CleanupReport } from "@/ipc/cleanup";
import type { WorktreeInfo } from "@/ipc/worktrees";

// Pure helpers for Settings → Worktrees: grouping the list by repo, naming a row,
// and laying the auto-cleanup preview over the rows it would touch.

export interface RepoGroup {
  repo: string;
  items: WorktreeInfo[];
}

/** Worktrees grouped by repo, the repos in the order the listing first names them. */
export function groupByRepo(worktrees: WorktreeInfo[]): RepoGroup[] {
  const groups = new Map<string, WorktreeInfo[]>();
  for (const wt of worktrees) {
    const items = groups.get(wt.repo);
    if (items) items.push(wt);
    else groups.set(wt.repo, [wt]);
  }
  return [...groups].map(([repo, items]) => ({ repo, items }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a row is called, and its full dir name as a title when that's shortened. */
export interface RowName {
  text: string;
  title?: string;
}

/**
 * The owner's name (a session's title, a ticket's key) when trace knows it;
 * otherwise the dir name, a session's UUID cut to its first 8 characters.
 */
export function worktreeName(wt: Pick<WorktreeInfo, "name" | "owner">): RowName {
  if (wt.owner) return { text: wt.owner.label };
  if (UUID.test(wt.name)) return { text: wt.name.slice(0, 8), title: wt.name };
  return { text: wt.name };
}

/** What the next auto-cleanup pass does to a listed worktree. */
export type CleanupMark = { kind: "delete" } | { kind: "kept"; reason: string };

/** A path to compare: forward slashes, no trailing separator. */
const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
const lastPart = (p: string) => norm(p).split("/").pop() ?? p;

/**
 * Each listed worktree the preview names, keyed by its listed path. Matched by
 * path; failing that (git can list a path resolved differently from the one trace
 * builds), by dir name when exactly one listed worktree has it.
 */
export function cleanupMarks(
  worktrees: WorktreeInfo[],
  report: CleanupReport | null
): Map<string, CleanupMark> {
  const marks = new Map<string, CleanupMark>();
  if (!report) return marks;
  const byPath = new Map(worktrees.map((wt) => [norm(wt.path), wt.path]));
  const byDir = new Map<string, string | null>();
  for (const wt of worktrees) {
    const dir = lastPart(wt.path);
    byDir.set(dir, byDir.has(dir) ? null : wt.path);
  }
  for (const item of report.items) {
    const listed = byPath.get(norm(item.path)) ?? byDir.get(lastPart(item.path));
    if (!listed) continue;
    marks.set(listed, item.held ? { kind: "kept", reason: item.held } : { kind: "delete" });
  }
  return marks;
}

/** How many worktrees the next pass deletes (those it keeps aren't counted). */
export function deleteCount(report: CleanupReport | null): number {
  return report ? report.items.filter((it) => !it.held).length : 0;
}

/** Clean, merged, idle: the no-questions-asked "Remove N merged" set. */
export function removableMerged(worktrees: WorktreeInfo[]): WorktreeInfo[] {
  return worktrees.filter((wt) => wt.merged && !wt.dirty && !wt.running);
}
