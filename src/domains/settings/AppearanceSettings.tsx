import { type CSSProperties, useState } from "react";
import { InlineConfirm } from "@/components/InlineConfirm";
import { resetTermPrefs } from "@/domains/agent/terminalPrefs";
import { applyTerminalPrefs } from "@/domains/agent/terminalRegistry";
import { useAppearance } from "@/domains/appearance/store";
import { useScrollAnchor } from "@/domains/appearance/useScrollAnchor";
import { useStackedLayout } from "@/domains/appearance/useStackedLayout";
import { ChatAppearance } from "./ChatAppearance";
import { InterfaceAppearance } from "./InterfaceAppearance";
import { TerminalAppearance } from "./TerminalAppearance";
import { ThemeAppearance } from "./ThemeAppearance";

// Settings → Appearance: Interface, Theme, Chat & transcript, Terminal. Every
// control writes the appearance store (or terminalPrefs), which applies itself
// live (domains/appearance/apply.ts) and persists; each group shows a live
// preview beside it.
//
// Changing an option must not move the page under the pointer:
// - the Settings page keeps Standard density (appearance.css); previews show it;
// - previews sit in fixed-height frames, so their settings never resize them;
// - rows are never mounted or unmounted by an option, only disabled;
// - a zoom (Interface size) does move the page, so the clicked control is put
//   back under the pointer once it lands (useScrollAnchor), and the side-by-side
//   or stacked layout is decided in screen points, which a zoom doesn't change
//   (useStackedLayout). The previews column keeps its on-screen width (--ap-unzoom).
export function AppearanceSettings() {
  const reset = useAppearance((s) => s.reset);
  const appliedScale = useAppearance((s) => s.appliedScale);
  const stacked = useStackedLayout();
  const anchor = useScrollAnchor();
  // Bumped by Reset appearance: the terminal group re-reads terminalPrefs.
  const [resets, setResets] = useState(0);

  const resetAll = () => {
    resetTermPrefs();
    reset();
    applyTerminalPrefs();
    setResets((n) => n + 1);
  };

  return (
    <div
      className={`ap-page${stacked ? " stacked" : ""}`}
      style={{ "--ap-unzoom": 100 / appliedScale } as CSSProperties}
      onClickCapture={anchor}
    >
      <InterfaceAppearance />
      <ThemeAppearance />
      <ChatAppearance />
      <TerminalAppearance key={resets} />

      <div className="ap-reset">
        <InlineConfirm
          label="Reset appearance"
          message="Reset every appearance setting, the terminal's font, size, line height and scrollback included?"
          confirmLabel="Reset"
          onConfirm={resetAll}
        />
      </div>
    </div>
  );
}
