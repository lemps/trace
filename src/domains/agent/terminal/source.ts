import { useBoardStore } from "@/domains/board/store";
import { useSessionsStore } from "@/domains/sessions/store";
import { workspaceInfo } from "@/ipc/workspace";
import type { ContextSource } from "./contextText";

// Which workspace a terminal belongs to, from its registry key: an agent's is the
// workspace id itself, a shell's is `term:<workspace>`, a scheduled run's
// `sched:<runId>` (whose prompt's worktree isn't a workspace).

const SHELL = "term:";
const RUN = "sched:";

/** The workspace a terminal runs in, or null for a scheduled run. */
export function workspaceOf(key: string): string | null {
  if (key.startsWith(RUN)) return null;
  return key.startsWith(SHELL) ? key.slice(SHELL.length) : key;
}

/** A workspace's name: its ticket's summary or its session's title. */
function labelOf(workspaceId: string): string | undefined {
  const issue = useBoardStore.getState().data?.issues.find((i) => i.key === workspaceId);
  if (issue) return issue.summary;
  const session = useSessionsStore
    .getState()
    .sessions.find((s) => s.id === workspaceId || s.agents?.some((a) => a.id === workspaceId));
  return session?.title;
}

/** Where a terminal's output came from, for Copy Context's header. */
export async function contextSource(key: string): Promise<ContextSource> {
  const workspace = workspaceOf(key);
  if (!workspace) return { kind: "scheduled run", id: key.slice(RUN.length) };
  const info = await workspaceInfo(workspace).catch(() => null);
  return {
    kind: key.startsWith(SHELL) ? "shell" : "agent",
    label: labelOf(workspace),
    id: workspace,
    cwd: info?.cwd,
    branch: info?.branch,
  };
}

/** The directory a terminal's relative paths are relative to, when known. */
export async function workingDir(key: string): Promise<string | null> {
  const workspace = workspaceOf(key);
  if (!workspace) return null;
  const info = await workspaceInfo(workspace).catch(() => null);
  return info?.cwd ?? null;
}
