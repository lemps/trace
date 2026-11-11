import { openUrl } from "@tauri-apps/plugin-opener";
import { I } from "@/components/Icon";
import type { RowAction, RowActionSection } from "@/components/useRowMenu";
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

/** The card's Start, by id: the card draws it as its always-visible `Start` button. */
export const START_ACTION = "start";

/**
 * Everything a board card offers, as one list: its ⋯ and its right-click menu show
 * it all. Open, Start (also the card's own button), its PR and epic (also its pills),
 * and, once it has an agent, the worktree's "Open in …" editors, the same items as
 * the ticket detail's ⋯ (`editorItems`).
 */
export function cardMenu({
  issueKey,
  onStart,
  hasAgent,
  pr,
  epic,
  onOpen,
}: CardMenuArgs): RowActionSection[] {
  const main: RowAction[] = [{ id: "open", label: "Open", onSelect: onOpen }];
  if (onStart)
    main.push({
      id: START_ACTION,
      label: "Start agent",
      glyph: I.Play,
      title: `Start an agent on ${issueKey} with the ticket brief`,
      onSelect: onStart,
    });
  const links: RowAction[] = [];
  if (pr)
    links.push({
      id: "pr",
      label: `Open PR #${pr.number} on GitHub`,
      glyph: I.External,
      onSelect: () => void openUrl(pr.url),
    });
  if (epic)
    links.push({
      id: "epic",
      label: `Open epic ${epic.key} in Jira`,
      glyph: I.External,
      onSelect: () => void openUrl(epic.url),
    });
  return [
    { items: main },
    { items: links },
    { title: "Worktree", items: hasAgent ? editorItems(issueKey) : [] },
  ];
}
