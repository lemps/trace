import { openUrl } from "@tauri-apps/plugin-opener";
import type { MenuItem, MenuSection } from "@/components/PopMenu";
import { editorItems } from "@/domains/agent/editorItems";
import type { PullRequest } from "@/domains/issues/types";

interface CardMenuArgs {
  issueKey: string;
  /** Set when the card offers Start (no agent yet, not done). */
  onStart?: () => void;
  /** It has an agent, so a worktree to open in an editor. */
  hasAgent: boolean;
  pr: PullRequest | null;
  /** The epic's page in the tracker, when it has one. */
  epic?: { key: string; url: string };
  onOpen: () => void;
}

/**
 * A board card's right-click menu: everything the card offers (open, start, its PR,
 * its epic) and, once it has an agent, the worktree's "Open in …" editors, the same
 * items as the ticket detail's ⋯ (`editorItems`).
 */
export function cardMenu({
  issueKey,
  onStart,
  hasAgent,
  pr,
  epic,
  onOpen,
}: CardMenuArgs): MenuSection[] {
  const links: MenuItem[] = [];
  if (pr)
    links.push({ label: `Open PR #${pr.number} on GitHub`, onSelect: () => void openUrl(pr.url) });
  if (epic)
    links.push({ label: `Open epic ${epic.key} in Jira`, onSelect: () => void openUrl(epic.url) });
  return [
    {
      items: [
        { label: "Open", onSelect: onOpen },
        ...(onStart ? [{ label: "Start agent", onSelect: onStart }] : []),
      ],
    },
    { items: links },
    { title: "Worktree", items: hasAgent ? editorItems(issueKey) : [] },
  ];
}
