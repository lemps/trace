import type { MenuSection } from "@/components/PopMenu";
import { closeSubagentTabs } from "./closedTabs";
import { openSubagentBeside } from "./subagentPanel";

interface ChatTabMenuArgs {
  workspaceId: string;
  /** `"main"`, or a subagent's call id. */
  tab: string;
  /** Subagents whose tabs can close: finished, and not waiting on you. */
  finished: readonly string[];
}

/**
 * A chat tab's right-click menu: everything its tab offers in one list. A subagent's
 * opens beside or closes; any tab, Main included, can close the finished ones.
 */
export function chatTabMenu({ workspaceId, tab, finished }: ChatTabMenuArgs): MenuSection[] {
  const closeFinished = {
    label: "Close finished tabs",
    disabled: finished.length === 0,
    onSelect: () => closeSubagentTabs(workspaceId, finished),
  };
  if (tab === "main") return [{ items: [closeFinished] }];
  return [
    { items: [{ label: "Open beside", onSelect: () => openSubagentBeside(workspaceId, tab) }] },
    {
      items: [
        {
          label: "Close",
          disabled: !finished.includes(tab),
          title: finished.includes(tab) ? undefined : "It's still working, or waiting on you",
          onSelect: () => closeSubagentTabs(workspaceId, [tab]),
        },
        closeFinished,
      ],
    },
  ];
}
