import type { ReactNode } from "react";
import type { IconProps } from "@/components/Icon";

/**
 * One tab-like view a detail can show in a pane: an agent's chat, HTML, Files, a
 * shell, a ticket's tests — or, through `registerPanelKind`, a view another domain
 * owns (a subagent's conversation). The layout only places it; what it shows is
 * `render`'s business.
 */
export interface PanelDescriptor {
  /** Unique in its detail view, and stable: layouts are stored by it. */
  id: string;
  label: string;
  icon: (p: IconProps) => ReactNode;
  /** The tab's tooltip. */
  title?: string;
  /** After the label: a status dot, a count. */
  badge?: ReactNode;
  /** Controls at the end of the strip while this tab is shown (the agent's view switch). */
  toolbar?: ReactNode;
  /** Rendered right after this tab in its strip (the session's "+ agent"). */
  after?: ReactNode;
  /** Tabs of a section sit together; a thin rule divides neighbours from different ones (agents | workspace). */
  section?: string;
  /**
   * In the layout only once opened, and closable (a subagent's view). Fixed panels
   * are always somewhere, and a stored layout missing one gets it back.
   */
  optional?: boolean;
  /**
   * The content. It stays mounted while the tab is shown — moving it to another pane
   * moves its DOM, so terminals, scroll and selection survive — and unmounts when hidden.
   */
  render: () => ReactNode;
}

/**
 * A family of optional panels another domain provides, named by an id prefix
 * (`sub:` → a subagent's view). `resolve` gets the rest of the id and returns the
 * panel, or null if it no longer exists (the layout then drops it). `owner` is the
 * agent workspace it belongs to: only a detail hosting that agent shows it.
 */
export interface PanelKind {
  prefix: string;
  resolve: (rest: string) => { owner: string; panel: PanelDescriptor } | null;
}
