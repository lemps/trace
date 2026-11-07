import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "@/app/toast";
import type { MenuItem } from "@/components/PopMenu";
import { workspaceInfo } from "@/ipc/workspace";
import { currentOs } from "@/platform/os";
import { joinNative } from "@/platform/paths";
import { editorItems } from "../editorItems";

// What can be done with a worktree file from the Files viewer: the terminal's link
// menu's own items (Open in VS Code / IntelliJ / Cursor, Show in folder, Copy path),
// plus the full path, which the viewer's relative one lacks.

export function copyText(text: string, what: string): void {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`Copied the ${what}.`))
    .catch((e) => toast.error(`Couldn't copy: ${String(e)}`));
}

/** `path` (relative, git's form) as a full path in the OS's own separators. */
async function fullPath(workspaceId: string, path: string): Promise<string | null> {
  const info = await workspaceInfo(workspaceId).catch(() => null);
  return info ? joinNative(info.cwd, path, currentOs) : null;
}

async function copyFullPath(workspaceId: string, path: string): Promise<void> {
  const full = await fullPath(workspaceId, path);
  if (full) copyText(full, "full path");
  else toast.error("Can't tell where this workspace's files are.");
}

async function showInFolder(workspaceId: string, path: string): Promise<void> {
  const full = await fullPath(workspaceId, path);
  if (!full) {
    toast.error("Can't tell where this workspace's files are.");
    return;
  }
  await revealItemInDir(full).catch(() => toast.error(`${path} isn't there any more.`));
}

/** The viewer's "Open in" menu for `path`; a deleted file can only have its path copied. */
export function fileMenu(workspaceId: string, path: string, isGone: boolean): MenuItem[][] {
  const open = editorItems(workspaceId, path).map((item) => ({ ...item, disabled: isGone }));
  return [
    [
      ...open,
      {
        label: "Show in folder",
        disabled: isGone,
        onSelect: () => void showInFolder(workspaceId, path),
      },
    ],
    [
      { label: "Copy path", onSelect: () => copyText(path, "path") },
      { label: "Copy full path", onSelect: () => void copyFullPath(workspaceId, path) },
    ],
  ];
}
