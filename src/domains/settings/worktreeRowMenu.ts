import type { RowAction, RowActionSection } from "@/components/useRowMenu";
import type { WorktreeInfo, WorktreeOwner } from "@/ipc/worktrees";

interface WorktreeRowMenuArgs {
  wt: Pick<WorktreeInfo, "owner" | "running">;
  onOpen: (owner: WorktreeOwner) => void;
  onReveal: () => void;
  onCopyPath: () => void;
  onRemove: () => void;
}

const OPEN_LABEL: Record<WorktreeOwner["kind"], string> = {
  session: "Open session",
  ticket: "Open ticket",
  prompt: "Open scheduled prompt",
};

/**
 * Everything a worktree row offers (its ⋯ and right-click): open what it belongs
 * to, when trace knows; its folder; and Remove, which waits while an agent runs
 * in it (the backend refuses then too).
 */
export function worktreeRowMenu({
  wt,
  onOpen,
  onReveal,
  onCopyPath,
  onRemove,
}: WorktreeRowMenuArgs): RowActionSection[] {
  const owner = wt.owner;
  const open: RowAction[] = owner
    ? [{ id: "open", label: OPEN_LABEL[owner.kind], onSelect: () => onOpen(owner) }]
    : [];
  return [
    { items: open },
    {
      items: [
        { id: "reveal", label: "Show in folder", onSelect: onReveal },
        { id: "copy", label: "Copy path", onSelect: onCopyPath },
      ],
    },
    {
      items: [
        {
          id: "remove",
          label: "Remove",
          danger: true,
          disabled: wt.running,
          detail: wt.running ? "Stop the agent first." : "Deletes the folder and its branch.",
          onSelect: onRemove,
        },
      ],
    },
  ];
}
