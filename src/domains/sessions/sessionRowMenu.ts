import { openUrl } from "@tauri-apps/plugin-opener";
import type { MenuSection } from "@/components/PopMenu";
import { editorItems } from "@/domains/agent/editorItems";
import type { ScratchSession } from "./types";

interface SessionRowMenuArgs {
  session: ScratchSession;
  /** Its PR, when it has one. */
  pr?: { number: number; url: string } | null;
  onOpen: () => void;
  onRename: () => void;
  onArchive: () => void;
}

/**
 * A session row's right-click menu: everything the row offers (open, rename, its PR,
 * archive) and the session's "Open in …" editors, the same items its detail's ⋯ has
 * (`editorItems`; none for a sandbox, whose files aren't on this computer).
 */
export function sessionRowMenu({
  session,
  pr,
  onOpen,
  onRename,
  onArchive,
}: SessionRowMenuArgs): MenuSection[] {
  return [
    {
      items: [
        { label: "Open", onSelect: onOpen },
        { label: "Rename", onSelect: onRename },
        ...(pr
          ? [{ label: `Open PR #${pr.number} on GitHub`, onSelect: () => void openUrl(pr.url) }]
          : []),
      ],
    },
    {
      title: session.folder ? "Folder" : "Worktree",
      items: session.host ? [] : editorItems(session.id),
    },
    { items: [{ label: "Archive", onSelect: onArchive }] },
  ];
}
