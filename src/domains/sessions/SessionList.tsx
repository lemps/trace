import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "@/app/toast";
import type { AgentLight } from "@/domains/live/types";
import { isShortcut } from "@/platform/shortcuts";
import { sessionsDrag, useRowDragging } from "./dragState";
import { useListPrefs, useSessionOrderStore } from "./orderStore";
import {
  heldOrder,
  insertBefore,
  moveBy,
  type Placed,
  type SortMode,
  sortLabel,
  sortSessions,
} from "./sortSessions";
import type { ScratchSession } from "./types";

/** What a row needs from its list to take part in ordering. */
export interface RowOrdering {
  depth: number;
  /** The drop indicator's place on this row while something is dragged over. */
  dropMark: "before" | "after" | null;
  onKeyDown: (e: KeyboardEvent) => void;
}

interface SessionListProps {
  /** `orderStore` key for this list (a section, or a tab's unsectioned area). */
  listKey: string;
  items: ScratchSession[];
  lights: Record<string, AgentLight>;
  lastActive: Record<string, number>;
  /** File a session dragged in from another list here. */
  onMoveIn: (sessionId: string) => void;
  renderRow: (session: ScratchSession, ordering: RowOrdering) => ReactNode;
  /** Shown when the list is empty. */
  empty?: ReactNode;
}

// One list of sessions on the Sessions page, in its own sort (`SortMenu`). In
// Manual its rows drag up and down, or into another list, and ⌥↑/⌥↓ moves the
// focused row; doing either in another sort switches the list to Manual from
// the order on screen. A sorted list holds still while the pointer is on it, a
// row in it has focus, or a row is being dragged, so rows don't move from
// under you; it catches up when you leave.
export function SessionList(props: SessionListProps) {
  const { listKey, items, lights, lastActive, onMoveIn, renderRow, empty } = props;
  const prefs = useListPrefs(listKey);
  const save = useSessionOrderStore((s) => s.save);
  const dragging = useRowDragging();
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<string[]>([]);
  // A drag cancelled (Esc) or dropped elsewhere leaves no indicator behind.
  useEffect(() => {
    if (!dragging) setDropBefore(undefined);
  }, [dragging]);

  const placed = sortSessions(items, prefs.sort, { lights, lastActive, order: prefs.order });
  const byId = new Map<string, Placed>(placed.map((p) => [p.session.id, p]));
  const hold = prefs.sort !== "manual" && (hover || focusIn || dragging);
  const fresh = placed.map((p) => p.session.id);
  // Idempotent, so a repeated render (StrictMode) lands on the same order.
  const ids = hold ? heldOrder(shownRef.current, fresh) : fresh;
  shownRef.current = ids;
  const rows = ids.map((id) => byId.get(id)).filter((p): p is Placed => p != null);

  /** Make `next` the list's order; a sorted list becomes Manual, and says so. */
  const commit = (next: string[], from: SortMode) => {
    void save(listKey, { sort: "manual", order: next });
    if (from !== "manual") {
      toast.info(
        `Switched to Manual order, starting from how it was sorted by ${sortLabel(from)}.`
      );
    }
  };

  const rowKeyDown = (id: string) => (e: KeyboardEvent) => {
    const delta = isShortcut("sessionMoveUp", e) ? -1 : isShortcut("sessionMoveDown", e) ? 1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const next = moveBy(ids, id, delta);
    if (next.join(" ") !== ids.join(" ")) commit(next, prefs.sort);
  };

  /** The row a drop at this height lands before (null = after the last), skipping the dragged one. */
  const beforeAt = (clientY: number, dragId: string): string | null => {
    const els = listRef.current?.querySelectorAll<HTMLElement>("[data-sid]") ?? [];
    for (const el of els) {
      if (el.dataset.sid === dragId) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return el.dataset.sid ?? null;
    }
    return null;
  };
  // A row from this list drops anywhere in it; one from another list only in
  // Manual (a sorted list just files it, through the section's own drop).
  const accepts = () => {
    const drag = sessionsDrag.current;
    if (drag?.kind !== "session") return null;
    const inList = items.some((s) => s.id === drag.id);
    return inList || prefs.sort === "manual" ? { id: drag.id, inList } : null;
  };

  const onDragOver = (e: DragEvent) => {
    const drag = accepts();
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    setDropBefore(beforeAt(e.clientY, drag.id));
  };
  const onDragLeave = (e: DragEvent) => {
    if (!listRef.current?.contains(e.relatedTarget as Node | null)) setDropBefore(undefined);
  };
  const onDrop = (e: DragEvent) => {
    const drag = accepts();
    setDropBefore(undefined);
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    sessionsDrag.current = null;
    // From what's on screen now, so a session that appeared mid-drag keeps its place.
    const next = insertBefore(ids, drag.id, beforeAt(e.clientY, drag.id));
    if (!drag.inList) onMoveIn(drag.id);
    if (next.join(" ") !== ids.join(" ") || !drag.inList) commit(next, prefs.sort);
  };

  const markFor = (id: string, i: number): RowOrdering["dropMark"] => {
    if (dropBefore === undefined) return null;
    if (dropBefore === id) return "before";
    return dropBefore === null && i === rows.length - 1 ? "after" : null;
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop zone; the rows are the controls
    <div
      ref={listRef}
      className="session-list"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {rows.length === 0 && dropBefore === undefined ? empty : null}
      {rows.length === 0 && dropBefore !== undefined && <div className="sl-drop-empty" />}
      {rows.map((p, i) =>
        renderRow(p.session, {
          depth: p.depth,
          dropMark: markFor(p.session.id, i),
          onKeyDown: rowKeyDown(p.session.id),
        })
      )}
    </div>
  );
}
