import { I } from "@/components/Icon";
import { useBoardStore } from "@/domains/board/store";
import { type Coming, comingFields, useComing } from "@/domains/panes/coming";
import type { PanelDescriptor } from "@/domains/panes/types";
import { FilesPane } from "./FilesPane";
import { useChangeWatch } from "./files/useChangeWatch";
import { TerminalPane } from "./TerminalPane";
import { useWorkspaceTabsStore } from "./workspaceTabsStore";

export interface WorkspaceTabsState {
  files: Coming & { changes: number };
  terminal: Coming;
}

/**
 * A workspace's Files and Terminal tabs, under the tabs rule (.claude/rules/tabs.md):
 * Files has content while the worktree has changes, Terminal while a shell is open.
 * The × hides either; Files comes back when the change count moves. Both open empty
 * from the pane menu (browse the worktree, start a shell).
 * `hasFiles`: false for a plain folder, which has no git for Files to read.
 */
export function useWorkspaceTabs(ws: string, hasFiles = true): WorkspaceTabsState {
  const changes = useWorkspaceTabsStore((s) => s.changes[ws] ?? 0);
  const shell = useBoardStore((s) => s.runningAgents.has(`term:${ws}`));
  const files = useComing("files", ws, changes > 0, String(changes));
  const terminal = useComing("terminal", ws, shell, "shell");
  // Hidden, nothing else reads the changes: watch them, so new ones bring it back.
  useChangeWatch(ws, hasFiles && !files.visible);
  return { files: { ...files, changes }, terminal };
}

/** The Files tab of `ws`: the worktree's changes, or (opened empty) its files. */
export function filesTab(ws: string, state: WorkspaceTabsState, section?: string): PanelDescriptor {
  const { files } = state;
  return {
    id: "files",
    label: "Files",
    icon: I.Code,
    title: "What the agent changed, and the worktree's files",
    badge: files.changes > 0 ? <span className="count">{files.changes}</span> : undefined,
    section,
    ...comingFields(files, true),
    render: () => <FilesPane workspaceId={ws} />,
  };
}

/**
 * The Terminal tab of `ws`: a plain shell in its worktree, started as the tab opens
 * empty. Its × hides it and the shell keeps running; `exit` ends it.
 */
export function terminalTab(
  ws: string,
  state: WorkspaceTabsState,
  section?: string
): PanelDescriptor {
  const { terminal } = state;
  return {
    id: "terminal",
    label: "Terminal",
    icon: I.Terminal,
    title: "A shell in this workspace, beside its agent",
    section,
    ...comingFields(terminal, true),
    render: () => <TerminalPane issueKey={ws} autoStart={terminal.peeking} />,
  };
}
