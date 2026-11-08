import type { ComponentProps } from "react";
import { useAriaKeys, useTitleWithHint } from "@/platform/shortcuts";

// The one icon-only button (trace-ui §2 rule 4): it always names itself. `label` is
// both the tooltip and the accessible name, and a shortcut id adds its chord to the
// tooltip ("Close (⌘W)", following rebinds) and to `aria-keyshortcuts`.

export interface IconButtonProps extends Omit<ComponentProps<"button">, "aria-label"> {
  /** What it does, in a word or two: the tooltip and `aria-label`. Required. */
  label: string;
  /** A shortcut id from `platform/shortcuts/definitions.ts`, named in the tooltip. */
  shortcut?: string;
  /** `md` is `.btn.icon` (30px), `sm` 26px, `xs` 20px; all `--radius-sm`. */
  size?: "md" | "sm" | "xs";
  /** Overrides the tooltip only for a *why* (a disabled reason, a consequence). */
  title?: string;
}

const SIZE_CLASS = { md: "", sm: " sm", xs: " xs" } as const;

/**
 * Renders `.btn.icon` (+ `sm`/`xs`). Extra classes ("ghost", "danger", a domain's own)
 * go in `className`; every other button prop passes through.
 */
export function IconButton({
  label,
  shortcut,
  size = "md",
  title,
  className,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  const named = useTitleWithHint(label, shortcut ?? "");
  const keys = useAriaKeys(shortcut ?? "");
  return (
    <button
      type={type}
      className={`btn icon${SIZE_CLASS[size]}${className ? ` ${className}` : ""}`}
      title={title ?? named}
      aria-label={label}
      aria-keyshortcuts={keys}
      {...rest}
    >
      {children}
    </button>
  );
}
