import { Segmented } from "@/components/Segmented";
import { AppPreview } from "@/domains/appearance/previews/AppPreview";
import { useAppearance } from "@/domains/appearance/store";
import { AccentPicker, ThemePicker } from "@/domains/appearance/ThemePicker";
import type { DarkThemeId, LightThemeId } from "@/domains/appearance/themes";
import { AppearanceGroup } from "./AppearanceGroup";
import { SettingRow } from "./SettingRow";

const LIGHTS: { value: LightThemeId; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "paper", label: "Paper" },
];
const DARKS: { value: DarkThemeId; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "midnight", label: "Midnight" },
];

const NOT_SYSTEM = "Applies when the theme is System.";

/** What this group's reset puts back. */
const KEYS = ["theme", "lightTheme", "darkTheme", "accent"] as const;

// Appearance → Theme: the app's colours. The System theme's light and dark picks
// are always shown, and only inactive (dimmed, out of reach, with the reason in
// the hint's place) under another theme: showing and hiding them would move
// everything below as the theme changes.
export function ThemeAppearance() {
  const prefs = useAppearance((s) => s.prefs);
  const update = useAppearance((s) => s.update);
  const reset = useAppearance((s) => s.reset);
  const isSystem = prefs.theme === "system";
  return (
    <AppearanceGroup
      title="Theme"
      desc="Colours for the whole app."
      preview={<AppPreview />}
      onReset={() => reset(KEYS)}
    >
      <ThemePicker />
      <SettingRow
        label="In light mode"
        hint="The theme System uses while the OS is light."
        inactive={!isSystem}
        inactiveReason={NOT_SYSTEM}
      >
        <Segmented
          label="Light mode theme"
          value={prefs.lightTheme}
          options={LIGHTS}
          onChange={(lightTheme) => update({ lightTheme })}
        />
      </SettingRow>
      <SettingRow
        label="In dark mode"
        hint="The theme System uses while the OS is dark."
        inactive={!isSystem}
        inactiveReason={NOT_SYSTEM}
      >
        <Segmented
          label="Dark mode theme"
          value={prefs.darkTheme}
          options={DARKS}
          onChange={(darkTheme) => update({ darkTheme })}
        />
      </SettingRow>
      <SettingRow
        label="Accent"
        hint="Focus, selection and highlights. Amber, blue and green stay reserved for agent state."
      >
        <AccentPicker />
      </SettingRow>
    </AppearanceGroup>
  );
}
