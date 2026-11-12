// Settings' tabs, in order, and the ids older links still use. Pure, so
// `tabIds.test.ts` covers the mapping.

export type SettingsTab =
  | "repositories"
  | "worktrees"
  | "agents"
  | "prompts"
  | "assistant"
  | "notifications"
  | "appearance"
  | "layout"
  | "shortcuts"
  | "about";

/** Ids from before the tabs were regrouped (Sidebar and Tabs into Layout, Updates into About). */
export type LegacySettingsTab = "sidebar" | "tabs" | "updates";

/** Repositories come first: they are where every agent works, and what a new install needs. */
export const SETTINGS_TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: "repositories", label: "Repositories" },
  { id: "worktrees", label: "Worktrees" },
  { id: "agents", label: "Agents" },
  { id: "prompts", label: "Prompts" },
  { id: "assistant", label: "Assistant" },
  { id: "notifications", label: "Notifications" },
  { id: "appearance", label: "Appearance" },
  { id: "layout", label: "Layout" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "about", label: "About" },
];

const LEGACY: Record<LegacySettingsTab, SettingsTab> = {
  sidebar: "layout",
  tabs: "layout",
  updates: "about",
};

/** The tab an id opens today, old ids included. */
export function settingsTabFor(id: SettingsTab | LegacySettingsTab): SettingsTab {
  return id in LEGACY ? LEGACY[id as LegacySettingsTab] : (id as SettingsTab);
}
