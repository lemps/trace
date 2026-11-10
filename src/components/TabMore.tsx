import { I } from "./Icon";

interface TabMoreProps {
  /** How many tabs are in its menu. */
  count: number;
  open: boolean;
  toggle: () => void;
  /** The strip's own tab look (`detail-tab`). */
  className: string;
}

/**
 * A fitted tab strip's overflow (`useTabFit`): a chevron and a mono "+3", named
 * "3 more tabs". Not `I.More`, which means a pane's actions.
 */
export function TabMore({ count, open, toggle, className }: TabMoreProps) {
  const name = `${count} more ${count === 1 ? "tab" : "tabs"}`;
  return (
    <button
      type="button"
      className={`${className} tab-more${open ? " open" : ""}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={name}
      title={name}
      onClick={toggle}
    >
      <I.Chevron size={12} />
      <span className="tab-more-count">+{count}</span>
    </button>
  );
}
