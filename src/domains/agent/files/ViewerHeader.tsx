import { Fragment, type ReactNode } from "react";
import { I } from "@/components/Icon";
import { PopMenu } from "@/components/PopMenu";
import { copyText } from "../copyText";
import { fileMenu } from "./fileActions";
import { crumbsOf } from "./filePaths";
import { STATUS } from "./TreeRow";
import type { Change } from "./tree";

interface ViewerHeaderProps {
  workspaceId: string;
  path: string;
  change: Change | undefined;
  /** Show a folder (or the file) in the tree. */
  onReveal: (path: string) => void;
  /** Controls specific to what's shown (line counts, Diff / Preview). */
  children?: ReactNode;
}

// The Files viewer's header: the path as breadcrumbs (each segment reveals itself in
// the tree), what changed, then the actions — copy the path, and the "Open in"
// menu with the same items as a file link's menu in the terminal.
export function ViewerHeader({ workspaceId, path, change, onReveal, children }: ViewerHeaderProps) {
  const crumbs = crumbsOf(path);
  const isGone = change?.status === "deleted";
  return (
    <div className="fx-vhead">
      <nav className="fx-crumbs" aria-label="File path" title={path}>
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <Fragment key={c.path}>
              {i > 0 && (
                <span className="fx-crumb-sep" aria-hidden="true">
                  <I.Chevron size={13} />
                </span>
              )}
              <button
                type="button"
                className={`fx-crumb${isLast ? " last" : ""}`}
                onClick={() => onReveal(c.path)}
                title={isLast ? `Show ${c.path} in the tree` : `Show ${c.path}/ in the tree`}
              >
                {c.name}
              </button>
            </Fragment>
          );
        })}
        {change?.oldPath && <span className="fx-renamed">from {change.oldPath}</span>}
      </nav>
      {change && (
        <span className={`fx-status st-${change.status}`} title={STATUS[change.status].word}>
          {STATUS[change.status].letter}
        </span>
      )}
      {children}
      <button
        type="button"
        className="fx-tool"
        onClick={() => copyText(path, "path")}
        title="Copy path"
        aria-label="Copy path"
      >
        <I.Copy size={14} />
      </button>
      <PopMenu
        align="right"
        sections={fileMenu(workspaceId, path, isGone).map((items) => ({ items }))}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className={`fx-tool text${open ? " on" : ""}`}
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <I.Code size={14} />
            Open in
            <span className="fx-caret" aria-hidden="true">
              <I.Chevron size={13} />
            </span>
          </button>
        )}
      />
    </div>
  );
}
