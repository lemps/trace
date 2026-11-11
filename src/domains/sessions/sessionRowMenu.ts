import { openUrl } from "@tauri-apps/plugin-opener";
import { I } from "@/components/Icon";
import type { RowActionSection } from "@/components/useRowMenu";
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
 * Everything a session row offers, as one list: its ⋯ and right-click menus show it
 * all, its hover bar Rename and Archive (`inBar`). Open, rename, its PR, the
 * session's "Open in …" editors (the same items as its detail's ⋯, `editorItems`;
 * none for a sandbox, whose files aren't on this computer), and Archive, which the
 * bin undoes, so it needs no confirm.
 */
export function sessionRowMenu({
  session,
  pr,
  onOpen,
  onRename,
  onArchive,
}: SessionRowMenuArgs): RowActionSection[] {
  return [
    {
      items: [
        { id: "open", label: "Open", onSelect: onOpen },
        { id: "rename", label: "Rename", glyph: I.Pencil, inBar: true, onSelect: onRename },
        ...(pr
          ? [
              {
                id: "pr",
                label: `Open PR #${pr.number} on GitHub`,
                glyph: I.External,
                onSelect: () => void openUrl(pr.url),
              },
            ]
          : []),
      ],
    },
    {
      title: session.folder ? "Folder" : "Worktree",
      items: session.host ? [] : editorItems(session.id),
    },
    {
      items: [
        { id: "archive", label: "Archive", glyph: I.Archive, inBar: true, onSelect: onArchive },
      ],
    },
  ];
}
