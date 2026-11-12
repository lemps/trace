import { cloneElement, isValidElement, type ReactElement, type ReactNode, useId } from "react";

interface SettingRowProps {
  label: string;
  hint?: ReactNode;
  /**
   * The setting doesn't apply now (another option rules it out). The row stays where
   * it is, dimmed and out of reach, rather than unmounting and moving the page.
   */
  inactive?: boolean;
  /** Why it doesn't apply ("Applies when Provider is Anthropic."); replaces the hint while inactive. */
  inactiveReason?: string;
  /** Label and hint on top, the control full width beneath (a textarea, a key field). */
  block?: boolean;
  children: ReactNode;
}

type Describable = ReactElement<{ "aria-describedby"?: string }>;

/**
 * One settings row: label + hint on the left, control on the right (or beneath, as
 * a `block`). The hint and the inactive reason share one cell, so switching between
 * them never changes the row's height. A plain `<select>`/`<input>`/`<textarea>`
 * child is described by the hint itself; any other control by the row's group.
 */
export function SettingRow({
  label,
  hint,
  inactive = false,
  inactiveReason,
  block = false,
  children,
}: SettingRowProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const showReason = inactive && Boolean(inactiveReason);
  const described = hint || showReason ? hintId : undefined;
  const isNative = isValidElement(children) && typeof children.type === "string";
  const control = isNative
    ? cloneElement(children as Describable, { "aria-describedby": described })
    : children;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a grid row; a <fieldset> brings its own box (min-width, legend) that every row would have to undo
    <div
      className={`setting-row${block ? " block" : ""}${inactive ? " inactive" : ""}`}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={isNative ? undefined : described}
      aria-disabled={inactive || undefined}
    >
      <div className="setting-text">
        <div className="label" id={labelId}>
          {label}
        </div>
        {(hint || inactiveReason) && (
          <div className="setting-hints">
            {hint && (
              <div
                className={showReason ? "hint off" : "hint"}
                id={showReason ? undefined : hintId}
                aria-hidden={showReason || undefined}
              >
                {hint}
              </div>
            )}
            {inactiveReason && (
              <div
                className={showReason ? "hint" : "hint off"}
                id={showReason ? hintId : undefined}
                aria-hidden={!showReason || undefined}
              >
                {inactiveReason}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="control" inert={inactive}>
        {control}
      </div>
    </div>
  );
}
