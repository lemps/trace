import type { CSSProperties, ReactNode } from "react";
import { useAppearance } from "../store";

interface PreviewFrameProps {
  /** Which preview: sets the frame's fixed height (appearance.css `.ap-frame.<kind>`). */
  kind: "interface" | "theme" | "chat" | "terminal";
  /** The value readout under the frame ("Dark · 14px · 1"), one line. */
  caption?: ReactNode;
  /** The frame's own dynamic paint (the terminal's background). */
  style?: CSSProperties;
  children: ReactNode;
}

// The window a preview is drawn in. Its height is fixed, so changing a setting
// never resizes the page: bigger text shows less, as it would in a real pane,
// and what doesn't fit fades out at the bottom edge. It carries the chosen
// density (data-density), which the Settings page itself ignores, so the
// preview shows density for real. `inert`: it's a picture, not controls.
export function PreviewFrame({ kind, caption, style, children }: PreviewFrameProps) {
  const density = useAppearance((s) => s.prefs.density);
  return (
    <div className="ap-preview">
      <div className={`ap-frame ${kind}`} data-density={density} style={style} inert>
        <div className="ap-frame-in">{children}</div>
      </div>
      {caption && <div className="ap-pv-caption">{caption}</div>}
    </div>
  );
}
