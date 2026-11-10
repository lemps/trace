import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Terminal } from "@xterm/xterm";
import { toast } from "@/app/toast";
import { ContextMenu } from "@/components/ContextMenu";
import type { MenuItem, MenuSection } from "@/components/PopMenu";
import { useHint } from "@/platform/shortcuts";
import { copyText } from "../copyText";
import { editorItems } from "../editorItems";
import { copyContext, copySelection } from "./copyContext";
import { isWebUrl, openWebUrl } from "./links";
import { isAbsolutePath, resolvePath } from "./paths";
import { workingDir, workspaceOf } from "./source";
import type { LinkTarget, TerminalMenu as MenuState } from "./store";

interface TerminalMenuProps {
  termKey: string;
  term: Terminal;
  menu: MenuState;
  onFind: () => void;
  onClose: () => void;
}

/** Show a file from the terminal in the system file manager. */
async function revealFile(termKey: string, path: string): Promise<void> {
  const cwd = isAbsolutePath(path) ? "" : await workingDir(termKey);
  if (cwd === null) {
    toast.error("Can't tell which folder this path is in.");
    return;
  }
  await revealItemInDir(resolvePath(cwd, path)).catch(() =>
    toast.error(`${path} isn't there any more.`)
  );
}

/** What can be done with the link the menu is for. */
function linkItems(termKey: string, link: LinkTarget): MenuItem[] {
  if (link.kind === "url") {
    return [
      ...(isWebUrl(link.url) ? [{ label: "Open link", onSelect: () => openWebUrl(link.url) }] : []),
      { label: "Copy link", onSelect: () => copyText(link.url, "link") },
    ];
  }
  const workspace = workspaceOf(termKey);
  return [
    ...(workspace ? editorItems(workspace, link.path) : []),
    { label: "Show in folder", onSelect: () => void revealFile(termKey, link.path) },
    { label: "Copy path", onSelect: () => copyText(link.path, "path") },
  ];
}

// The menu a click on a terminal link, or a right-click anywhere in a terminal,
// opens: the link's actions (Open, Copy, Open in editor), then the terminal's own
// (Copy, Copy context, Find) on a right-click. The app's `ContextMenu`, handing
// focus back to xterm after Escape or a pick so typing reaches the agent again.
export function TerminalMenu({ termKey, term, menu, onFind, onClose }: TerminalMenuProps) {
  const findHint = useHint("termFind");
  const contextHint = useHint("termCopyContext");
  const sections: MenuSection[] = [];
  if (menu.link) sections.push({ items: linkItems(termKey, menu.link) });
  if (menu.isContext) {
    sections.push({
      items: [
        { label: "Copy", onSelect: () => copySelection(term), disabled: !term.hasSelection() },
        {
          label: "Copy context",
          hint: contextHint,
          onSelect: () => void copyContext(termKey, term),
        },
        // An inline bar, not a dialog: no "…".
        { label: "Find", hint: findHint, onSelect: onFind },
      ],
    });
  }
  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      sections={sections}
      onClose={onClose}
      returnFocus={() => term.focus()}
    />
  );
}
