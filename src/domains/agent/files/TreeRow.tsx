import type { ReactNode } from "react";
import { I } from "@/components/Icon";
import type { ChangeKind } from "@/ipc/diff";
import { matchIn, type Query, type Row } from "./rows";
import type { FileNode } from "./tree";

/** The letter and word for each status, as git (and most editors) show them. */
export const STATUS: Record<ChangeKind, { letter: string; word: string }> = {
  added: { letter: "A", word: "Added" },
  untracked: { letter: "U", word: "New, not yet tracked by git" },
  modified: { letter: "M", word: "Modified" },
  deleted: { letter: "D", word: "Deleted" },
  renamed: { letter: "R", word: "Renamed" },
};

const CODE =
  /\.(c|cc|cpp|cs|css|go|h|hpp|html?|java|jsx?|kt|mjs|cjs|php|py|rb|rs|scss|sh|sql|swift|tsx?|vue|svelte|ps1|bat|lua|zig)$/i;
const TEXT =
  /\.(md|mdx|markdown|txt|rst|adoc|log|csv|json|jsonc|ya?ml|toml|ini|cfg|conf|lock|xml|env)$|^(license|readme|changelog|dockerfile|makefile)(\..*)?$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i;

/** A file's glyph from its name: code, text and config, an image, or a plain file. */
export function FileIcon({ name, size }: { name: string; size: number }) {
  if (IMAGE.test(name)) return <I.FileImage size={size} />;
  if (CODE.test(name)) return <I.FileCode size={size} />;
  if (TEXT.test(name)) return <I.FileText size={size} />;
  return <I.File size={size} />;
}

/** `name` with the filter's match marked, in Quick Open's look. */
function marked(name: string, range: [number, number] | null): ReactNode {
  if (!range) return name;
  const [a, b] = range;
  return (
    <>
      {name.slice(0, a)}
      <mark className="qo-hit">{name.slice(a, b)}</mark>
      {name.slice(b)}
    </>
  );
}

function Stat({ add, del }: { add: number; del: number }) {
  return (
    <span className="fx-stat">
      <span className="add">+{add}</span>
      <span className="del">−{del}</span>
    </span>
  );
}

function fileTitle(file: FileNode): string {
  const c = file.change;
  if (!c) return file.path;
  const what = STATUS[c.status].word;
  return c.oldPath ? `${file.path}\n${what} from ${c.oldPath}` : `${file.path}\n${what}`;
}

interface TreeRowProps {
  id: string;
  row: Row;
  isOpen: boolean;
  isCursor: boolean;
  isSelected: boolean;
  query: Query | null;
  /** Flat list: no folders, so each file names its folder after it. */
  flat: boolean;
  /** Show added/removed line counts (the Changes view). */
  showStats: boolean;
  /** In a chain, the folder the cursor is on, drawn brighter. */
  cursorPath: string | null;
  /** `segment`: which folder of a chain was clicked. */
  onClick: (row: Row, segment?: string) => void;
}

/** A compact chain's names, `src / domains / agent`, each one clickable on its own. */
function ChainName(p: { row: Row; query: Query | null; cursorPath: string | null }) {
  const chain = p.row.chain ?? [];
  return (
    <span className="fx-name">
      {chain.map((d, i) => (
        <span key={d.path}>
          {i > 0 && <span className="fx-chain-sep"> / </span>}
          <span
            className={`fx-seg${d.path === p.cursorPath ? " cur" : ""}`}
            data-seg={d.path}
            title={d.path}
          >
            {marked(d.name, matchIn(d, p.query))}
          </span>
        </span>
      ))}
    </span>
  );
}

// One row of the Files tree. Fixed height (the tree is virtualised); indent guides
// per level, a chevron on folders, and the git status at the end: a letter on a
// changed file, the number of changed files on a folder holding any.
export function TreeRow({
  id,
  row,
  isOpen,
  isCursor,
  isSelected,
  query,
  flat,
  showStats,
  cursorPath,
  onClick,
}: TreeRowProps) {
  const { node, depth } = row;
  const isDir = node.kind === "dir";
  const status = isDir ? node.rollup : node.change?.status;
  const cls = [
    "fx-row",
    isCursor && "cursor",
    isSelected && "selected",
    !isDir && node.change?.status === "deleted" && "gone",
  ]
    .filter(Boolean)
    .join(" ");
  const cut = node.path.lastIndexOf("/");
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the tree owns focus and the keys (aria-activedescendant); rows are reached with its arrows
    // biome-ignore lint/a11y/useFocusableInteractive: as above — focus stays on the tree
    <div
      id={id}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={isDir ? isOpen : undefined}
      aria-selected={isSelected}
      className={cls}
      title={row.chain ? undefined : isDir ? node.path : fileTitle(node)}
      onClick={(e) => {
        const seg = (e.target as HTMLElement).closest<HTMLElement>("[data-seg]");
        onClick(row, seg?.dataset.seg);
      }}
    >
      {Array.from({ length: depth }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: one guide per indent level
        <span key={i} className="fx-guide" aria-hidden="true" />
      ))}
      <span className={`fx-twisty${isOpen ? " open" : ""}`} aria-hidden="true">
        {isDir && <I.Chevron size={13} />}
      </span>
      <span className="fx-icon" aria-hidden="true">
        {isDir ? (
          isOpen ? (
            <I.FolderOpen size={14} />
          ) : (
            <I.Folder size={14} />
          )
        ) : (
          <FileIcon name={node.name} size={14} />
        )}
      </span>
      {row.chain ? (
        <ChainName row={row} query={query} cursorPath={isCursor ? cursorPath : null} />
      ) : (
        <span className="fx-name">{marked(node.name, matchIn(node, query))}</span>
      )}
      {flat && cut > 0 && <span className="fx-dir">{node.path.slice(0, cut)}</span>}
      {!isDir && node.change && showStats && <Stat add={node.change.add} del={node.change.del} />}
      {status && (
        <span className={`fx-status st-${status}`}>
          {isDir ? node.changed : STATUS[status].letter}
        </span>
      )}
    </div>
  );
}
