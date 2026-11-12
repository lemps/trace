import { Fragment } from "react";
import { navTracker } from "@/app/nav";
import { InlineConfirm } from "@/components/InlineConfirm";
import { Segmented } from "@/components/Segmented";
import { Switch } from "@/components/Switch";
import { useIssuesStore } from "@/domains/issues/store";
import { sidebarItem } from "@/domains/sidebar/items";
import { isDefaultSidebar } from "@/domains/sidebar/prefs";
import { RECENTS_DELAYS } from "@/domains/sidebar/recentsDelay";
import { useSidebarStore } from "@/domains/sidebar/store";
import { useHint } from "@/platform/shortcuts";
import { SettingRow } from "./SettingRow";
import { SettingSection } from "./SettingSection";
import { SidebarRow } from "./SidebarRow";
import { useSidebarDrag } from "./useSidebarDrag";

const DELAY_OPTIONS = RECENTS_DELAYS.map((ms) => ({
  value: ms,
  label: ms === 0 ? "Instant" : `${ms / 1000}s`,
}));

// Settings → Layout → Sidebar: every page the rail can show, in the rail's order. Each can be
// hidden or shown, and dragged (or moved with the buttons / Alt+↑↓) into a new place;
// Settings itself stays, at the bottom. Changes reach the rail at once. Below the
// list, whether resting on Sessions slides out your recent sessions (off by
// default), and how long it waits first (inactive while it's off, never unmounted).
export function SidebarSettings() {
  const entries = useSidebarStore((s) => s.entries);
  const setVisibility = useSidebarStore((s) => s.setVisibility);
  const nudge = useSidebarStore((s) => s.nudge);
  const reset = useSidebarStore((s) => s.reset);
  const recentsFlyout = useSidebarStore((s) => s.recentsFlyout);
  const setRecentsFlyout = useSidebarStore((s) => s.setRecentsFlyout);
  const recentsDelay = useSidebarStore((s) => s.recentsDelay);
  const setRecentsDelay = useSidebarStore((s) => s.setRecentsDelay);
  const trackers = useIssuesStore((s) => s.sessions);
  const searchKey = useHint("search");
  const movable = entries.filter((e) => !sidebarItem(e.id)?.isFixed).map((e) => e.id);
  const drag = useSidebarDrag(movable);
  const isDefault = isDefaultSidebar(entries);

  return (
    <SettingSection
      title="Sidebar"
      desc={`The pages in the rail on the left, top to bottom. Drag a row, or use its arrows, to reorder. A hidden page still opens from search (${searchKey}).`}
      actions={
        <InlineConfirm
          label="Reset to default"
          disabled={isDefault}
          title={isDefault ? "The sidebar is in its built-in order" : undefined}
          message="Put every page back in its built-in place and visibility?"
          confirmLabel="Reset"
          onConfirm={reset}
        />
      }
    >
      <div className="sb-list">
        {entries.map((entry) => {
          const def = sidebarItem(entry.id);
          if (!def) return null;
          const tracker = navTracker(entry.id);
          const i = movable.indexOf(entry.id);
          return (
            <Fragment key={entry.id}>
              {drag.dropAt(entry.id) && <div className="sb-drop" aria-hidden="true" />}
              {def.isFixed && drag.dropAt(null) && <div className="sb-drop" aria-hidden="true" />}
              <SidebarRow
                def={def}
                entry={entry}
                connected={!tracker || Boolean(trackers[tracker])}
                canUp={i > 0}
                canDown={i !== -1 && i < movable.length - 1}
                isDragging={drag.dragging === entry.id}
                dragProps={def.isFixed ? undefined : drag.rowProps(entry.id)}
                onVisibility={(v) => setVisibility(entry.id, v)}
                onNudge={(d) => nudge(entry.id, d)}
                searchHint={`search (${searchKey})`}
              />
            </Fragment>
          );
        })}
      </div>
      <SettingRow
        label="Recent sessions"
        hint="Resting the pointer on Sessions, while it's open, slides out the sessions you last opened."
      >
        <Switch on={recentsFlyout} onChange={setRecentsFlyout} label="Show recent sessions" />
      </SettingRow>
      <SettingRow
        label="Recent sessions delay"
        hint="How long the pointer rests on Sessions before your recent sessions slide out."
        inactive={!recentsFlyout}
        inactiveReason="Applies when Recent sessions is on."
      >
        <Segmented
          label="Recent sessions delay"
          value={recentsDelay}
          options={DELAY_OPTIONS}
          onChange={setRecentsDelay}
        />
      </SettingRow>
    </SettingSection>
  );
}
