import { openUrl } from "@tauri-apps/plugin-opener";
import { I } from "@/components/Icon";
import type { RowAction, RowActionSection } from "@/components/useRowMenu";
import { editorItems } from "@/domains/agent/editorItems";
import type { LiveEntry } from "@/domains/live/entries";
import { useSessionsStore } from "@/domains/sessions/store";

interface AgentRowActionsArgs {
  entry: LiveEntry;
  onOpen: () => void;
  /** Its PR, where the row knows it (Fleet). */
  pr?: { number: number | string; url: string } | null;
  /** The row's own frequent actions (Inbox: Dismiss, Open), first and in its bar. */
  lead?: RowAction[];
}

/**
 * Everything a live agent's row offers (Fleet, Inbox), as one list for its ⋯ and its
 * right-click: open it, its PR, and its worktree's "Open in …" editors, the same items
 * as its detail's ⋯ (`editorItems`). A scheduled run has no worktree of its own here,
 * and a sandbox session's files aren't on this computer, so neither gets editors.
 * Answering and stopping stay in the agent's detail (and the Inbox's answer pane).
 */
export function useAgentRowActions({
  entry,
  onOpen,
  pr,
  lead,
}: AgentRowActionsArgs): RowActionSection[] {
  const session = useSessionsStore((s) =>
    entry.source === "session" ? s.sessions.find((x) => x.id === entry.worktreeId) : undefined
  );
  const worktree = entry.source === "scheduled" || session?.host ? null : entry.worktreeId;
  const main: RowAction[] = lead ?? [{ id: "open", label: "Open", onSelect: onOpen }];
  const links: RowAction[] = pr
    ? [
        {
          id: "pr",
          label: `Open PR #${pr.number} on GitHub`,
          glyph: I.External,
          onSelect: () => void openUrl(pr.url),
        },
      ]
    : [];
  return [
    { items: main },
    { items: links },
    {
      title: session?.folder ? "Folder" : "Worktree",
      items: worktree ? editorItems(worktree) : [],
    },
  ];
}
