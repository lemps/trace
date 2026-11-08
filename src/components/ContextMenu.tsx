import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "@/hooks/useDismiss";
import { MenuItemBody, type MenuSection } from "./PopMenu";

interface ContextMenuProps {
  /** Where the pointer was (client coordinates). */
  x: number;
  y: number;
  sections: MenuSection[];
  onClose: () => void;
}

// PopMenu's popover, opened at the pointer by a right-click (or the context-menu key)
// instead of under a trigger. Kept inside the window; takes focus so arrows move
// through it and Esc closes it.
export function ContextMenu({ x, y, sections, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(ref, true, close);
  const visible = sections.filter((s) => s.items.length > 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const left = Math.max(4, Math.min(x, window.innerWidth - el.offsetWidth - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - el.offsetHeight - 4));
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    if (pos) ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [pos]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = [
        ...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
      ];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  };

  // On the body: a transformed ancestor (a detail's entrance) would offset `fixed`.
  return createPortal(
    <div
      ref={ref}
      className="pop-menu-pop ctx-menu"
      role="menu"
      style={pos ?? { visibility: "hidden", left: x, top: y }}
      onKeyDown={onKeyDown}
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
    </div>,
    document.body
  );
}
