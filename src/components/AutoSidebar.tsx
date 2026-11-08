import {
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePersistedFlag } from "@/hooks/usePersistedFlag";
import { I, type IconProps } from "./Icon";

// A pane's list beside what it shows (Plan's documents, Gallery's sets, Files' tree)
// that gets out of the way: folded to a strip naming it, it slides out over the pane
// while the pointer rests on it and folds again once the pointer leaves, so what's
// being read keeps the width. Pinned, it stays open beside the pane instead, as a
// sidebar always was; the pin is remembered per kind of list.
//
// It also stays out while keyboard focus is inside it (Tab into it, or typing in a
// filter), and `peek` shows it for a moment from outside (revealing a file in the
// tree). A click doesn't hold it open: picking an item and moving on folds it.

/** Resting on the strip this long opens it, so passing across it doesn't. */
const OPEN_MS = 120;
/** Leaving it this long folds it, so a stray pixel outside doesn't. */
const CLOSE_MS = 280;
/** How long a peek stays out if the pointer never comes to it. */
const PEEK_MS = 2500;

export interface SidebarPin {
  pinned: boolean;
  toggle: () => void;
}

interface AutoSidebarProps {
  /** Names the pin in storage (`trace.sidebarPinned.<id>`). */
  id: string;
  /** What the strip and the header call it ("Plans"). */
  label: string;
  icon: (p: IconProps) => ReactNode;
  /** After the label: how many there are. */
  count?: number | null;
  /** Open width, in px. */
  width: number;
  /**
   * The list. Given the pin when the sidebar draws no header of its own
   * (`head={false}`), so the list's own header can carry it.
   */
  children: ReactNode | ((pin: SidebarPin) => ReactNode);
  /** Draw the label-and-pin header (default); off when the list has its own. */
  head?: boolean;
  /** Changing this shows the sidebar for a moment. */
  peek?: number;
  /** After the panel while pinned (a resize handle). */
  after?: ReactNode;
}

export function AutoSidebar(p: AutoSidebarProps) {
  const [pinned, togglePinned] = usePersistedFlag(`trace.sidebarPinned.${p.id}`, false);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const after = (ms: number, run: () => void) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(run, ms);
  };
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(peekTimer.current);
    },
    []
  );
  useEffect(() => {
    if (!p.peek) return;
    setPeeking(true);
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeeking(false), PEEK_MS);
  }, [p.peek]);

  const pin: SidebarPin = { pinned, toggle: togglePinned };
  const open = pinned || hover || focused || peeking;
  const onFocus = (e: FocusEvent) => {
    // Only the keyboard's focus holds it open: a clicked item keeps focus too.
    if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) setFocused(true);
  };
  const onBlur = (e: FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };
  const style = { "--as-w": `${p.width}px` } as CSSProperties;
  const cls = ["as", pinned ? "pinned" : open ? "open" : ""].filter(Boolean).join(" ");

  return (
    <aside
      aria-label={p.label}
      className={cls}
      style={style}
      onPointerEnter={() => after(OPEN_MS, () => setHover(true))}
      onPointerLeave={() => {
        setPeeking(false);
        after(CLOSE_MS, () => setHover(false));
      }}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {!pinned && (
        <div className="as-strip sp-strip" aria-hidden={open || undefined}>
          <span className="sp-strip-item as-strip-item">
            <p.icon size={14} />
            <span className="sp-strip-label">{p.label}</span>
            {p.count != null && p.count > 0 && <span className="sp-count">{p.count}</span>}
          </span>
        </div>
      )}
      <div className="as-panel" inert={!open || undefined}>
        {p.head !== false && (
          <div className="as-head">
            <span className="as-title">{p.label}</span>
            {p.count != null && p.count > 0 && <span className="as-count">{p.count}</span>}
            <PinButton pin={pin} label={p.label} />
          </div>
        )}
        <div className="as-body">
          {typeof p.children === "function" ? p.children(pin) : p.children}
        </div>
      </div>
      {pinned && p.after}
    </aside>
  );
}

/** Pin or unpin a sidebar; for a list header of its own (`head={false}`). */
export function PinButton({ pin, label }: { pin: SidebarPin; label: string }) {
  const what = pin.pinned
    ? `Let the ${label.toLowerCase()} hide`
    : `Keep the ${label.toLowerCase()} open`;
  return (
    <button
      type="button"
      className={pin.pinned ? "btn ghost icon as-pin on" : "btn ghost icon as-pin"}
      aria-label={what}
      aria-pressed={pin.pinned}
      title={what}
      onClick={pin.toggle}
    >
      <I.Pin size={13} />
    </button>
  );
}
