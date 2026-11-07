import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Terminal } from "@xterm/xterm";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { toast } from "@/app/toast";
import type { MenuItem } from "@/components/PopMenu";
import { useDismiss } from "@/hooks/useDismiss";
import { useHint } from "@/platform/shortcuts";
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

const copyText = (text: string, what: string) => {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`Copied the ${what}.`))
    .catch((e) => toast.error(`Couldn't copy: ${String(e)}`));
};

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

/** Keep the menu inside the pane: flip it left/up when it would run off an edge. */
function place(menu: MenuState, root: DOMRect, size: { w: number; h: number }) {
  let left = menu.x - root.left;
  let top = menu.y - root.top;
  if (left + size.w > root.width) left = Math.max(0, left - size.w);
  if (top + size.h > root.height) top = Math.max(0, top - size.h);
  return { left, top };
}

// The menu a click on a terminal link, or a right-click anywhere in a terminal,
// opens: the link's actions (Open, Copy, Open in editor), then the terminal's own
// (Copy, Copy Context, Find) on a right-click. Rendered inside the terminal pane.
export function TerminalMenu({ termKey, term, menu, onFind, onClose }: TerminalMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(ref, true, close);
  const findHint = useHint("termFind");
  const contextHint = useHint("termCopyContext");

  useLayoutEffect(() => {
    const el = ref.current;
    const root = el?.offsetParent?.getBoundingClientRect();
    if (!el || !root) return;
    setPos(place(menu, root, { w: el.offsetWidth, h: el.offsetHeight }));
  }, [menu]);

  const sections: MenuItem[][] = [];
  if (menu.link) sections.push(linkItems(termKey, menu.link));
  if (menu.isContext) {
    sections.push([
      { label: "Copy", onSelect: () => copySelection(term), disabled: !term.hasSelection() },
      {
        label: withHint("Copy context", contextHint),
        id: "context",
        onSelect: () => void copyContext(termKey, term),
      },
      { label: withHint("Find…", findHint), id: "find", onSelect: onFind },
    ]);
  }

  return (
    <div
      ref={ref}
      className="pop-menu-pop term-menu"
      role="menu"
      style={pos ?? { visibility: "hidden" }}
    >
      {sections.map((items, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: sections are fixed per menu
        <div key={i} className="pop-menu-section">
          {items.map((item) => (
            <button
              key={item.id ?? String(item.label)}
              type="button"
              role="menuitem"
              className="pop-menu-item"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              <span className="check" />
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function withHint(label: string, hint: string) {
  return (
    <>
      <span className="term-menu-label">{label}</span>
      {hint && <span className="kbd">{hint}</span>}
    </>
  );
}
