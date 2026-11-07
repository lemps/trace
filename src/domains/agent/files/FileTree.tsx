import {
  type KeyboardEvent,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { jumpTo, type Query, type Row, treeKey } from "./rows";
import { TreeRow } from "./TreeRow";
import type { DirNode, FileNode } from "./tree";

/** Rows drawn beyond each edge of the viewport, so a fast scroll doesn't flash blank. */
const OVERSCAN = 12;
/** Typing more within this long extends a type-to-jump prefix. */
const TYPE_AHEAD_MS = 700;

/** Ask the tree to put its cursor on `path` and scroll it into view. */
export interface TreeFocus {
  path: string;
  nonce: number;
}

interface FileTreeProps {
  rows: readonly Row[];
  isOpen: (dir: DirNode) => boolean;
  /** The file in the viewer. */
  selected: string | null;
  query: Query | null;
  flat: boolean;
  showStats: boolean;
  focus: TreeFocus | null;
  label: string;
  onToggle: (dir: DirNode, open: boolean) => void;
  onOpen: (file: FileNode) => void;
}

/** The scroller's height, and the height every row is drawn at (it follows density). */
function useMeasure() {
  const scroller = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ viewport: 400, row: 24 });
  useLayoutEffect(() => {
    const read = () =>
      setSize({
        viewport: scroller.current?.clientHeight ?? 400,
        row: probe.current?.offsetHeight || 24,
      });
    read();
    const ro = new ResizeObserver(read);
    if (scroller.current) ro.observe(scroller.current);
    if (probe.current) ro.observe(probe.current);
    return () => ro.disconnect();
  }, []);
  return { scroller, probe, ...size };
}

// The Files tree: rows from `rows.ts`, drawn a screenful at a time so a 100k-file
// worktree scrolls like a small one. Focus stays on the tree itself; a cursor moves
// over the rows (aria-activedescendant), separate from the file open in the viewer.
export function FileTree(props: FileTreeProps) {
  const { rows, isOpen, selected, query, flat, showStats, focus, label, onToggle, onOpen } = props;
  const { scroller, probe, viewport, row: rowH } = useMeasure();
  const [scrollTop, setScrollTop] = useState(0);
  const [cursorPath, setCursorPath] = useState<string | null>(selected);
  const [byKeyboard, setByKeyboard] = useState(false);
  const typed = useRef({ text: "", at: 0 });
  const idBase = useId();

  const cursor = useMemo(
    () => (cursorPath === null ? -1 : rows.findIndex((r) => r.node.path === cursorPath)),
    [rows, cursorPath]
  );

  const scrollToIndex = useCallback(
    (i: number, center = false) => {
      const el = scroller.current;
      if (!el || i < 0) return;
      const top = i * rowH;
      if (center) el.scrollTop = Math.max(0, top - el.clientHeight / 2 + rowH / 2);
      else if (top < el.scrollTop) el.scrollTop = top;
      else if (top + rowH > el.scrollTop + el.clientHeight)
        el.scrollTop = top + rowH - el.clientHeight;
    },
    [scroller, rowH]
  );

  // A reveal (breadcrumb, Quick Open): put the cursor there and bring it into view
  // once its folders are open, which is the render after the request.
  const handledFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!focus || handledFocus.current === focus.nonce) return;
    const i = rows.findIndex((r) => r.node.path === focus.path);
    if (i < 0) return;
    handledFocus.current = focus.nonce;
    setCursorPath(focus.path);
    scrollToIndex(i, true);
  }, [focus, rows, scrollToIndex]);

  const moveTo = (i: number) => {
    const target = rows[i];
    if (!target) return;
    setCursorPath(target.node.path);
    scrollToIndex(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    setByKeyboard(true);
    const page = Math.max(1, Math.floor(viewport / rowH) - 1);
    const action = treeKey(rows, cursor, e.key, isOpen, page);
    if (action) {
      e.preventDefault();
      if (action.kind === "move") moveTo(action.to);
      else if (action.kind === "toggle") onToggle(action.dir, action.open);
      else onOpen(action.file);
      return;
    }
    if (e.key.length !== 1 || e.key === " ") return;
    // Type-to-jump: letters typed in quick succession build a prefix.
    e.preventDefault();
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at < TYPE_AHEAD_MS ? t.text + e.key : e.key;
    t.at = now;
    const hit = jumpTo(rows, cursor, t.text);
    if (hit >= 0) moveTo(hit);
  };

  const onRowClick = (r: Row) => {
    setByKeyboard(false);
    setCursorPath(r.node.path);
    if (r.node.kind === "dir") onToggle(r.node, !isOpen(r.node));
    else onOpen(r.node);
  };

  const first = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewport) / rowH) + OVERSCAN);
  const rowId = (i: number) => `${idBase}-r${i}`;

  return (
    <div
      ref={scroller}
      className={`fx-tree${byKeyboard ? " by-keys" : ""}`}
      role="tree"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={cursor >= first && cursor < last ? rowId(cursor) : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={() => setByKeyboard(false)}
      onFocus={() => {
        // Arriving with nothing under the cursor starts it on the open file, or the top.
        if (cursor < 0 && rows.length > 0) {
          const at = selected ? rows.findIndex((r) => r.node.path === selected) : -1;
          setCursorPath(rows[Math.max(at, 0)].node.path);
        }
      }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div ref={probe} className="fx-row fx-probe" aria-hidden="true" />
      <div className="fx-rows" style={{ height: rows.length * rowH }}>
        <div style={{ transform: `translateY(${first * rowH}px)` }}>
          {rows.slice(first, last).map((r, k) => (
            <TreeRow
              key={r.node.path + r.node.kind}
              id={rowId(first + k)}
              row={r}
              isOpen={r.node.kind === "dir" && isOpen(r.node)}
              isCursor={first + k === cursor}
              isSelected={r.node.kind === "file" && r.node.path === selected}
              query={query}
              flat={flat}
              showStats={showStats}
              onClick={onRowClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
