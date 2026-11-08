import { useEffect, useState } from "react";
import { useSetupStore } from "@/domains/setup/store";
import { AgentDefaultsSettings } from "./AgentDefaultsSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { AssistantSettings } from "./AssistantSettings";
import { AutoCleanupSettings } from "./AutoCleanupSettings";
import { BuddySettings } from "./BuddySettings";
import { NotificationSettings } from "./NotificationSettings";
import { RepoSettings } from "./RepoSettings";
import { SavedPromptsSettings } from "./SavedPromptsSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { SidebarSettings } from "./SidebarSettings";
import { TabsSettings } from "./TabsSettings";
import { type SettingsTab, useSettingsTabRequest } from "./tabStore";
import { UpdateSettings } from "./UpdateSettings";
import { WorktreeSettings } from "./WorktreeSettings";

// Repositories come first: they are where every agent works, and the first thing
// a new install needs.
const TABS: { id: SettingsTab; label: string }[] = [
  { id: "repositories", label: "Repositories" },
  { id: "agents", label: "Agents" },
  { id: "notifications", label: "Notifications" },
  { id: "assistant", label: "Assistant" },
  { id: "appearance", label: "Appearance" },
  { id: "sidebar", label: "Sidebar" },
  { id: "tabs", label: "Tabs" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "worktrees", label: "Worktrees" },
  { id: "updates", label: "Updates" },
];

// Settings: one tab per concern, so each is a short page rather than one long scroll.
export function SettingsView() {
  const [tab, setTab] = useState<SettingsTab>(
    () => useSettingsTabRequest.getState().take() ?? "repositories"
  );
  // Asked for a tab while already open (the cheat sheet's "Customize…").
  const requested = useSettingsTabRequest((s) => s.requested);
  useEffect(() => {
    if (requested) setTab(useSettingsTabRequest.getState().take() ?? requested);
  }, [requested]);
  // Bumped when auto-cleanup removes worktrees, so the list remounts and rescans.
  const [worktreeScan, setWorktreeScan] = useState(0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="desc">
            Where agents work, how they start, and how trace looks and gets your attention.
          </div>
        </div>
        <div className="right">
          <button type="button" className="btn" onClick={() => useSetupStore.getState().start()}>
            Run setup again
          </button>
        </div>
      </div>
      <div className="detail-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`detail-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="page-body">
        <div className="settings-wrap">
          {tab === "repositories" && <RepoSettings />}
          {tab === "agents" && (
            <>
              <AgentDefaultsSettings />
              <SavedPromptsSettings />
            </>
          )}
          {tab === "notifications" && <NotificationSettings />}
          {tab === "assistant" && (
            <>
              <AssistantSettings />
              <BuddySettings />
            </>
          )}
          {tab === "appearance" && <AppearanceSettings />}
          {tab === "sidebar" && <SidebarSettings />}
          {tab === "tabs" && <TabsSettings />}
          {tab === "shortcuts" && <ShortcutSettings />}
          {tab === "worktrees" && (
            <>
              <AutoCleanupSettings onCleaned={() => setWorktreeScan((n) => n + 1)} />
              <WorktreeSettings key={worktreeScan} />
            </>
          )}
          {tab === "updates" && <UpdateSettings />}
        </div>
      </div>
    </div>
  );
}
