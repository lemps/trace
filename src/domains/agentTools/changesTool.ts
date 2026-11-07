import type Anthropic from "@anthropic-ai/sdk";
import { runsAsChat } from "@/domains/agentChat/deliver";
import type { ScratchSession } from "@/domains/sessions/types";
import { loadJournal } from "@/ipc/agentChat";
import { type FileSummary, gitDiffFile, gitDiffSummary } from "@/ipc/diff";
import { flag, need, str } from "./args";
import { capDiffs, changeList, DIFF_CAP, unified } from "./changesFormat";
import { findSession } from "./sessionTools";

// What a session changed in its worktree, from the Files tab's own backend
// (`worktree_diff`: against the merge-base with origin's default branch,
// committed and uncommitted, new files included). Read-only, so any agent may
// look at any session.

export const GET_SESSION_CHANGES: Anthropic.Tool = {
  name: "get_session_changes",
  description: `See what a session changed in its worktree, the way trace's Files tab shows it: every changed file with its status (added, modified, deleted, renamed, untracked) and +/− line counts, against where its branch left the repo's default branch (committed and uncommitted work). With diff: true, also the unified diff, of one path or of every file, cut at ${DIFF_CAP.toLocaleString("en-US")} characters with a note saying what was left out. For a chat agent it also lists the files its turns edited. Read-only; works for any session. A session in a plain folder (no git) has no changes to show.`,
  input_schema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "The session's id (from start_session or list_sessions), or its exact title.",
      },
      diff: {
        type: "boolean",
        description: "Include the unified diff (default false: just the file list).",
      },
      path: {
        type: "string",
        description: "With diff: only this file's diff (a path from the file list).",
      },
    },
    required: ["session_id"],
  },
};

/** The files a chat agent's turns edited, from its journal's diff rows. */
async function chatEdits(id: string): Promise<string[]> {
  if (!(await runsAsChat(id))) return [];
  const rows = await loadJournal(id).catch(() => []);
  const paths = rows.flatMap((r) => (r.body.kind === "diff" ? [r.body.path] : []));
  return [...new Set(paths)];
}

async function diffs(session: ScratchSession, files: FileSummary[], path: string): Promise<string> {
  const picked = path ? files.filter((f) => f.path === path || f.oldPath === path) : files;
  if (path && picked.length === 0) {
    return `No changed file "${path}" in this session. Use a path from the list above.`;
  }
  const parts: string[] = [];
  let size = 0;
  for (const f of picked) {
    // Past the cap nothing more is shown: name the rest rather than diff them.
    if (size > DIFF_CAP) {
      parts.push(`${f.path} (not shown)`);
      continue;
    }
    const d = await gitDiffFile(session.id, f.path, f.oldPath).catch((e) => String(e));
    const text = typeof d === "string" ? `${f.path}: couldn't diff it (${d})` : unified(d, f);
    size += text.length;
    parts.push(text);
  }
  return capDiffs(parts);
}

/** Run get_session_changes. */
export async function runGetSessionChanges(input: unknown): Promise<string> {
  const session = findSession(need(input, "session_id"));
  const head = `"${session.title}" (id ${session.id})`;
  if (session.folder) {
    return `${head} runs in a plain folder (${session.folder}), not a git worktree, so trace has no changes to show for it.`;
  }
  const summary = await gitDiffSummary(session.id);
  const parts = [`${head}: ${changeList(summary)}`];
  const edited = await chatEdits(session.id);
  if (edited.length)
    parts.push(`Files its chat turns edited:\n${edited.map((p) => `- ${p}`).join("\n")}`);
  if (flag(input, "diff") && summary.files.length) {
    parts.push(await diffs(session, summary.files, str(input, "path")));
  }
  return parts.join("\n\n");
}
