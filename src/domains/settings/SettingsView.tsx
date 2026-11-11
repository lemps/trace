import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PopMenu } from "@/components/PopMenu";
import { TabMore } from "@/components/TabMore";
import { useTabFit } from "@/components/useTabFit";
import { useSetupStore } from "@/domains/setup/store";
import { AgentDefaultsSettings } from "./AgentDefaultsSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { AssistantSettings } from "./AssistantSettings";
import { BuddySettings } from "./BuddySettings";
import { KickoffPromptSettings } from "./KickoffPromptSettings";
import { NotificationSettings } from "./NotificationSettings";
import { RepoSettings } from "./RepoSettings";
import { SavedPromptsSettings } from "./SavedPromptsSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { SidebarSettings } from "./SidebarSettings";
import { TabsSettings } from "./TabsSettings";
import { SETTINGS_TABS, type SettingsTab } from "./tabIds";
import { useSettingsTabRequest } from "./tabStore";
import { UpdateSettings } from "./UpdateSettings";
import { WorktreeSettings } from "./WorktreeSettings";

// Settings: one tab per concern, so each is a short page rather than one long scroll.
// The tabs are words only, so a narrow window sends the last ones to a "more" menu
// (`useTabFit`) rather than clipping them. `settings-page` on the root is a stable
// hook for page-wide rules (the scrollbar gutter; Appearance's density pin).
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

  const fitRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const fit = useTabFit(fitRef, moreRef, tab);
  // A new tab starts at its top, not wherever the last one was scrolled to.
  const bodyRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on a tab change, by design
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [tab]);

  return (
    <div className="page settings-page">
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
        <div className="tab-fit" ref={fitRef}>
          {SETTINGS_TABS.map((t) => {
            const out = fit.mode(t.id) === "out";
            return (
              <button
                key={t.id}
                type="button"
                data-fit-tab={t.id}
                className={`detail-tab${tab === t.id ? " active" : ""}${out ? " fit-out" : ""}`}
                aria-hidden={out || undefined}
                tabIndex={out ? -1 : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {fit.out.length > 0 && (
          <div className="tab-fit-more" ref={moreRef}>
            <PopMenu
              align="right"
              trigger={({ open, toggle }) => (
                <TabMore
                  count={fit.out.length}
                  open={open}
                  toggle={toggle}
                  className={`detail-tab${open ? " active" : ""}`}
                />
              )}
              sections={[
                {
                  items: SETTINGS_TABS.filter((t) => fit.out.includes(t.id)).map((t) => ({
                    id: t.id,
                    label: t.label,
                    onSelect: () => setTab(t.id),
                  })),
                },
              ]}
            />
          </div>
        )}
      </div>
      <div className="page-body" ref={bodyRef}>
        <div className="settings-wrap">
          {tab === "repositories" && <RepoSettings />}
          {tab === "worktrees" && (
            <>
              <WorktreeSettings />
            </>
          )}
          {tab === "agents" && <AgentDefaultsSettings />}
          {tab === "prompts" && (
            <>
              <KickoffPromptSettings />
              <SavedPromptsSettings />
            </>
          )}
          {tab === "assistant" && <AssistantSettings />}
          {tab === "notifications" && <NotificationSettings />}
          {tab === "appearance" && <AppearanceSettings />}
          {tab === "layout" && (
            <>
              <SidebarSettings />
              <TabsSettings />
              <BuddySettings />
            </>
          )}
          {tab === "shortcuts" && <ShortcutSettings />}
          {tab === "about" && <UpdateSettings />}
        </div>
      </div>
    </div>
  );
}
