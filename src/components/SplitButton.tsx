import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import { MenuCaret } from "./MenuCaret";
import { type MenuSection, PopMenu } from "./PopMenu";

interface SplitButtonProps {
  /** The main action, at the same tier: a worded `.btn` or an `IconButton`. */
  children: ReactNode;
  /** Names the caret, as its tooltip and `aria-label` ("More ways to copy"). */
  menuLabel: string;
  /** The full list, the main action included (trace-ui §5). */
  sections: MenuSection[];
  /** The tier: `md` 30 (headers), `sm` 26 (in-content toolbars), `xs` 20 (in rows). */
  size?: "md" | "sm" | "xs";
  /** Paint the caret `.btn.primary`, to match a primary main action. */
  primary?: boolean;
  /** Which edge of the split the menu lines up with. */
  align?: "left" | "right";
  /** Open the menu above (a composer at a pane's foot); the caret points up. */
  up?: boolean;
  /** Disables the caret only; the main action sets its own. */
  disabled?: boolean;
  /** Extra classes on the wrapper (placement, a reveal). */
  className?: string;
}

/**
 * A main action plus a caret that opens its choices: "Start Claude ▾", a table's
 * copy. The caret is an `IconButton` of the same tier, narrower than it is tall
 * (`menu.css`), and looks pressed while the menu is open.
 */
export function SplitButton({
  children,
  menuLabel,
  sections,
  size = "md",
  primary = false,
  align = "right",
  up = false,
  disabled,
  className,
}: SplitButtonProps) {
  const tier = size === "md" ? "" : ` ${size}`;
  return (
    <div className={`split-btn${tier}${className ? ` ${className}` : ""}`}>
      {children}
      <PopMenu
        align={align}
        up={up}
        sections={sections}
        trigger={({ open, toggle }) => (
          <IconButton
            size={size}
            className={`split-caret${primary ? " primary" : ""}`}
            label={menuLabel}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={disabled}
            onClick={toggle}
          >
            <MenuCaret size={size} up={up} />
          </IconButton>
        )}
      />
    </div>
  );
}
