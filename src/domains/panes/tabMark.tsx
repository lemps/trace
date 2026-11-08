import type { ReactNode } from "react";

/** A Tabs-menu label: a filled accent mark with something in the tab, a hollow one without. */
export function tabMark(label: string, filled: boolean): ReactNode {
  return (
    <span className="pn-mi">
      <span className={filled ? "pn-mi-mark filled" : "pn-mi-mark"} aria-hidden />
      {label}
      <span className="pn-sr">{filled ? "(has content)" : "(empty)"}</span>
    </span>
  );
}
