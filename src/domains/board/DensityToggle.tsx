import { Segmented } from "@/components/Segmented";
import { type Density, useDensity } from "./density";

const OPTIONS: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "rich", label: "Rich" },
];

// Card density for the board — a segmented control; the choice persists.
export function DensityToggle() {
  const density = useDensity((s) => s.density);
  const setDensity = useDensity((s) => s.setDensity);
  return <Segmented label="Card density" value={density} options={OPTIONS} onChange={setDensity} />;
}
