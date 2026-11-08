import { AccentPicker, ThemePicker } from "@/domains/appearance/ThemePicker";

// Step 2: the same theme cards and accent swatches as Settings → Appearance,
// applied the moment one is picked.
export function ThemeStep() {
  return (
    <>
      <div className="su-intro">
        Pick a look. You can change it, and much more, in Settings → Appearance.
      </div>
      <ThemePicker />
      <div className="su-label">Accent</div>
      <AccentPicker />
    </>
  );
}
