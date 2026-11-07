import { useAriaKeys, useTitleWithHint } from "@/platform/shortcuts";
import { I } from "./Icon";
import { KeyHint } from "./KeyHint";

// A detail header's way back: "← Sessions", its Esc in the tooltip (and as a chip
// when Settings → Shortcuts shows hints on buttons).
export function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  const title = useTitleWithHint(`Back to ${label}`, "detailBack");
  const keys = useAriaKeys("detailBack");
  return (
    <button
      type="button"
      className="back"
      onClick={onBack}
      title={title}
      aria-label={`Back to ${label}`}
      aria-keyshortcuts={keys}
    >
      <I.Back size={14} /> {label} <KeyHint id="detailBack" />
    </button>
  );
}
