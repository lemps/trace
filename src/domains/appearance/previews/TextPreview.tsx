import { useAppearance } from "../store";

// Settings → Appearance → Text and layout: the interface's type scale and a
// row of controls in the chosen font and density (the page itself shows the
// interface size, since it zooms with everything else).

const DENSITY_WORD = { compact: "Compact", standard: "Standard", comfortable: "Comfortable" };

export function TextPreview() {
  const prefs = useAppearance((s) => s.prefs);
  const font = prefs.uiFont.split(",")[0]?.replace(/["']/g, "").trim() || "Geist";
  return (
    <div className="ap-text-pv" inert aria-hidden="true">
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
        <span className="seg">
          <button type="button" className="on">
            List
          </button>
          <button type="button">Board</button>
        </span>
      </div>
      <div className="ap-pv-caption">
        {font} · {DENSITY_WORD[prefs.density]} · {prefs.uiScale}%
      </div>
    </div>
  );
}
