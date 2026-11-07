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
   * Out of the tab row for now (the Plan tab with nothing to show). The layout keeps
   * its place, so it comes back where it was; ⌘1–9 and the strip skip it.
   */
  hidden?: boolean;
  /**
   * For a tab that comes and goes: the pane menu always lists it, greyed out with
   * this hint while hidden, and picking it then calls `onReveal` and shows it.
   */
  menuHint?: string;
  onReveal?: () => void;
  /** Closable for now (shown empty after a reveal): its × calls this. */
  onClose?: () => void;
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
  /**
   * Live kinds: `subscribe` to whatever `resolve` reads, and `version` a cheap key
   * that changes when a resolved panel would (one appearing or going, a new label).
   * Details showing panels of the kind re-resolve when it changes.
   */
  subscribe?: (onChange: () => void) => () => void;
  version?: () => string;
}
