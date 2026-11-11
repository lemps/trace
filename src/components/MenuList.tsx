import type { CSSProperties, KeyboardEvent, Ref } from "react";
import { I } from "./Icon";
import type { MenuItem, MenuSection } from "./PopMenu";

// The one menu body (trace-ui §5): sections of items in a `.pop-menu-pop`, with
// arrow keys, Home / End and Escape. `PopMenu` places it under its trigger and
// `ContextMenu` at the pointer; both close through `onClose`, which runs before a
// picked item's `onSelect` so the item can move focus where it wants.

interface MenuListProps {
  sections: MenuSection[];
  /** Escape from inside the menu, or an item picked (called before its `onSelect`). */
  onClose: () => void;
  /** Placement classes beside `pop-menu-pop` (`right`, `ctx-menu`). */
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

const STEPS: Record<string, (at: number, n: number) => number> = {
  ArrowDown: (at, n) => (at + 1) % n,
  ArrowUp: (at, n) => (at - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

function onMenuKey(e: KeyboardEvent<HTMLDivElement>, onClose: () => void) {
  if (e.key === "Escape") {
    // Stopped here so a detail's Esc-to-go-back and xterm never see it.
    e.preventDefault();
    e.stopPropagation();
    onClose();
    return;
  }
  const step = STEPS[e.key];
  if (!step) return;
  e.preventDefault();
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  items[step(at, items.length)]?.focus();
}

export function MenuList({ sections, onClose, className, style, ref }: MenuListProps) {
  const visible = sections.filter((s) => s.items.length > 0);
  return (
    <div
      ref={ref}
      className={`pop-menu-pop${className ? ` ${className}` : ""}`}
      role="menu"
      style={style}
      onKeyDown={(e) => onMenuKey(e, onClose)}
    >
      {visible.map((section, i) => (
        <div key={section.title ?? i} className="pop-menu-section">
          {section.title && <div className="pop-menu-head">{section.title}</div>}
          {section.items.map((item, j) => (
            <button
              key={item.id ?? (typeof item.label === "string" ? item.label : j)}
              type="button"
              role="menuitem"
              className={`pop-menu-item${item.danger ? " danger" : ""}${item.muted ? " muted" : ""}`}
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              <MenuItemBody item={item} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** An item's check mark, label (+ its `detail` line) and shortcut hint. */
function MenuItemBody({ item }: { item: MenuItem }) {
  return (
    <>
      <span className="check">{item.checked && <I.Check size={12} />}</span>
      {item.detail ? (
        <span className="pop-menu-label">
          {item.label}
          <span className="pop-menu-detail">{item.detail}</span>
        </span>
      ) : item.hint ? (
        <span className="pop-menu-label">{item.label}</span>
      ) : (
        item.label
      )}
      {item.hint && <span className="kbd">{item.hint}</span>}
    </>
  );
}
