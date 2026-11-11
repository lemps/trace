import { Segmented } from "@/components/Segmented";
import { StatusLight } from "@/components/StatusLight";
import { useAppearance } from "../store";
import { PreviewFrame } from "./PreviewFrame";

// Settings → Appearance → Interface: the type scale, a row of real controls and
// two agent-state pills (which stop moving under Reduce motion), in the chosen
// fonts and density. The page itself shows the interface size: it zooms with
// everything else.

const DENSITY_WORD = { compact: "Compact", standard: "Standard", comfortable: "Comfortable" };
const VIEWS = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
] as const;

/** The first family typed, or "Default font": the caption names the pref, not what loaded. */
function fontWord(typed: string): string {
  return typed.split(",")[0]?.replace(/["']/g, "").trim() || "Default font";
}

export function InterfacePreview() {
  const prefs = useAppearance((s) => s.prefs);
  return (
    <PreviewFrame
      kind="interface"
      caption={`${fontWord(prefs.uiFont)} · ${DENSITY_WORD[prefs.density]} · ${prefs.uiScale}%`}
    >
      <div className="ap-text-pv">
        <div className="ap-text-label">In review</div>
        <div className="ap-text-title">Fix flaky board test</div>
        <div className="ap-text-body">
          The drag handler fires before the column has measured, so the drop lands one row low.
        </div>
        <div className="ap-text-meta">
          <span className="mono">TRACE-128</span> · updated 3m ago
        </div>
        <div className="ap-text-controls">
          <button type="button" className="btn primary">
            Start
          </button>
          <button type="button" className="btn">
            Open PR
          </button>
          <Segmented label="View" value="list" options={VIEWS} onChange={() => {}} />
        </div>
        <div className="ap-text-controls">
          <StatusLight light="working" variant="pill" />
          <StatusLight light="attention" variant="pill" />
        </div>
      </div>
    </PreviewFrame>
  );
}
