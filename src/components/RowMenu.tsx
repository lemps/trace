import { useTitleWithHint } from "@/platform/shortcuts";
import { ContextMenu } from "./ContextMenu";
import { IconButton } from "./IconButton";
import { MoreTrigger } from "./PopMenu";
import type { RowAction, RowActionSection, RowMenu } from "./useRowMenu";

interface RowMoreProps {
  menu: RowMenu;
  /** Its name, a word or two ("Session actions"). */
  label: string;
  /** The slot's class, for the row's reveal rule. */
  className?: string;
}

/**
 * A row's ⋯ (`MoreTrigger size="xs"`). Its slot keeps the click to itself (the row
 * would open), and a press on it while the menu is open isn't an outside press, so a
 * second click closes the menu rather than opening it again.
 */
export function RowMore({ menu, label, className }: RowMoreProps) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: only stops the ⋯'s own press and click reaching the row
    // biome-ignore lint/a11y/useKeyWithClickEvents: the ⋯ inside is a button; keys reach it directly
    <span
      ref={menu.moreRef}
      className={`row-more${className ? ` ${className}` : ""}`}
      onMouseDown={(e) => {
        if (menu.at) e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <MoreTrigger
        size="xs"
        className="ghost"
        label={label}
        open={menu.at?.fromMore === true}
        toggle={menu.toggleMore}
      />
    </span>
  );
}

interface RowBarProps {
  /** The frequent ones (`barActions`); everything is behind the ⋯ too. */
  actions: RowAction[];
  menu: RowMenu;
  /** The ⋯'s name ("Session actions"). */
  moreLabel: string;
  className?: string;
}

/** A row's hover bar: its frequent actions as `xs` icon buttons, then the ⋯ for all. */
export function RowBar({ actions, menu, moreLabel, className }: RowBarProps) {
  return (
    <span className={className}>
      {actions.map((a) => (
        <BarButton key={a.id} action={a} />
      ))}
      <RowMore menu={menu} label={moreLabel} />
    </span>
  );
}

function BarButton({ action }: { action: RowAction }) {
  const Glyph = action.glyph;
  const named = useTitleWithHint(action.label, action.shortcut ?? "");
  // The tooltip names it; a disabled reason or a consequence is added after.
  const why = action.disabled ? action.detail : action.title;
  return (
    <IconButton
      size="xs"
      className={`ghost${action.danger ? " danger" : ""}`}
      label={action.label}
      shortcut={action.shortcut}
      title={why ? `${named}: ${why}` : undefined}
      disabled={action.disabled}
      onClick={(e) => {
        e.stopPropagation();
        action.onSelect();
      }}
    >
      {Glyph && <Glyph size={12} />}
    </IconButton>
  );
}

interface RowMenuPopoverProps {
  menu: RowMenu;
  sections: RowActionSection[];
}

/**
 * The row's menu, when open. Render it beside the row, not inside it: React passes a
 * portal's events up its own tree, so inside it a pick would also click the row.
 */
export function RowMenuPopover({ menu, sections }: RowMenuPopoverProps) {
  if (!menu.at) return null;
  const fromMore = menu.at.fromMore;
  return (
    <ContextMenu
      x={menu.at.x}
      y={menu.at.y}
      sections={sections}
      align={fromMore ? "right" : "left"}
      onClose={menu.close}
      returnFocus={
        fromMore ? () => menu.moreRef.current?.querySelector("button")?.focus() : undefined
      }
    />
  );
}
