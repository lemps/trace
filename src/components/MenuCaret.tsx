import { I } from "./Icon";
import { ICON_SIZE } from "./iconScale";

interface MenuCaretProps {
  /** The tier of the control it sits in (`IconButton`): 12px in `xs`, 14px otherwise. */
  size?: "md" | "sm" | "xs";
  /** Points up, for a menu that opens above its trigger. */
  up?: boolean;
}

/**
 * The one dropdown caret (trace-ui §1): a chevron turned to point where the menu
 * opens. In a split button's caret (`SplitButton`), after a picker's label, or beside
 * an icon in a menu trigger. Decoration only: the trigger carries the name.
 */
export function MenuCaret({ size = "md", up = false }: MenuCaretProps) {
  return (
    <span className={`menu-caret${up ? " up" : ""}`} aria-hidden="true">
      <I.Chevron size={size === "xs" ? ICON_SIZE.xs : ICON_SIZE.sm} />
    </span>
  );
}
