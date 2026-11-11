import type { MouseEvent, ReactNode } from "react";

interface FilterChipProps {
  /** On: the filter applies. Drawn and announced through `aria-pressed`. */
  active: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  /** How many items it matches, in mono after the label. */
  count?: number;
  /** A variant: `excluded` (struck through), `empty` (nothing would match). */
  className?: string;
  /** Only for a *why* or a hint the label can't carry (⌥-click hides a type). */
  title?: string;
}

// The `.filter-chip` (trace-ui §1): a toggleable filter on the Board, Inbox and
// Fleet. A state filter is chips, not tabs.
export function FilterChip({
  active,
  onClick,
  children,
  count,
  className,
  title,
}: FilterChipProps) {
  return (
    <button
      type="button"
      className={className ? `filter-chip ${className}` : "filter-chip"}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      {children}
      {count !== undefined && <span className="filter-chip-count">{count}</span>}
    </button>
  );
}
