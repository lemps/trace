import { type ReactNode, useCallback, useRef, useState } from "react";
import { useDismiss } from "@/hooks/useDismiss";
import { I } from "./Icon";
import { IconButton, type IconButtonProps } from "./IconButton";
import { MenuList } from "./MenuList";

export interface MenuItem {
  /** The plain action ("Open as chat"): never a disabled reason, which goes in `detail`. */
  label: ReactNode;
  onSelect: () => void;
  /** Stable key when `label` isn't a string. */
  id?: string;
  /** Marks the current choice in a pick-one list. */
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Greyed but still pickable: a tab with nothing in it yet, which opens empty. */
  muted?: boolean;
  /** A second, quieter line under the label: what it does, or why it's disabled. */
  detail?: string;
  /** A shortcut's current binding (`useHint`), shown at the item's end. */
  hint?: string;
  /** More about what it does, as a tooltip. */
  title?: string;
}

export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

interface PopMenuProps {
  /**
   * Renders the button that opens the menu. It sets `aria-haspopup="menu"` and
   * `aria-expanded={open}` (a `.btn` then looks pressed while open: `menu.css`).
   */
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  sections: MenuSection[];
  /** Which edge of the trigger the popover lines up with. */
  align?: "left" | "right";
  /** Open above the trigger (a composer at a pane's foot). */
  up?: boolean;
}

// A trigger plus a small popover of actions (`MenuList`), dismissed by an outside
// click, Escape, or picking an item. Behind every ⋯, split button caret
// (`SplitButton`) and picker.
export function PopMenu({ trigger, sections, align = "right", up = false }: PopMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close);
  // Only when focus is in the menu (arrowed or tabbed into): a mouse pick in WebKit
  // never focuses the item, and focus left where it was (a text box) stays there.
  const closeToTrigger = useCallback(() => {
    const wrap = wrapRef.current;
    const inMenu = wrap?.querySelector(".pop-menu-pop")?.contains(document.activeElement);
    setOpen(false);
    if (inMenu) wrap?.querySelector<HTMLElement>("button")?.focus();
  }, []);

  return (
    <div className="pop-menu" ref={wrapRef}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <MenuList
          className={`${align}${up ? " up" : ""}`}
          sections={sections}
          onClose={closeToTrigger}
        />
      )}
    </div>
  );
}

interface MoreTriggerProps {
  toggle: () => void;
  /** Whether its menu is open: `aria-expanded`, and the pressed look. */
  open?: boolean;
  label: string;
  /** The row's tier (`IconButton`): `md` in headers, `sm` in an in-content toolbar. */
  size?: IconButtonProps["size"];
  /** Extra classes (`ghost`, a domain's own). */
  className?: string;
}

/** The ⋯ overflow trigger for `PopMenu` — occasional actions live behind it. */
export function MoreTrigger({ toggle, open, label, size = "md", className }: MoreTriggerProps) {
  return (
    <IconButton
      label={label}
      size={size}
      className={className}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={toggle}
    >
      <I.More size={14} />
    </IconButton>
  );
}
