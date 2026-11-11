import { Switch } from "@/components/Switch";
import { CharacterPicker } from "@/domains/buddy/CharacterPicker";
import { useBuddyStore } from "@/domains/buddy/store";
import { SettingRow } from "./SettingRow";
import { SettingSection } from "./SettingSection";

// Settings → Layout → Buddy: the rail buddy on or off, and which character it
// wears. The picker stays on the page with the buddy off, inactive, so turning it
// on or off doesn't move what's below.
export function BuddySettings() {
  const enabled = useBuddyStore((s) => s.enabled);
  const setEnabled = useBuddyStore((s) => s.setEnabled);

  return (
    <SettingSection
      title="Buddy"
      desc="Your buddy lives above Settings in the rail, reacts to your agents, and comments on what happens. Each bubble is one Claude Haiku call through the Assistant tab's connection (at most 40 an hour)."
    >
      <SettingRow label="Show buddy" hint="Click it to say hi; right-click mutes it for an hour.">
        <Switch on={enabled} onChange={setEnabled} label="Show buddy" />
      </SettingRow>
      <SettingRow
        label="Character"
        hint="Hover one to see it cheer."
        inactive={!enabled}
        inactiveReason="Applies when Show buddy is on."
        block
      >
        <CharacterPicker />
      </SettingRow>
    </SettingSection>
  );
}
