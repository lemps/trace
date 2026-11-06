import { useEffect, useRef } from "react";
import { chordFromEvent } from "@/platform/shortcuts/chord";

/**
 * While `active`, the next key chord pressed goes to `onChord` instead of the app:
 * it's caught on the way down (capture phase), so no shortcut fires on it. Bare
 * modifiers wait for the rest of the chord; Esc on its own cancels.
 */
export function useChordRecorder(
  active: boolean,
  onChord: (chord: string) => void,
  onCancel: () => void
): void {
  const ref = useRef({ onChord, onCancel });
  ref.current = { onChord, onCancel };
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        ref.current.onCancel();
        return;
      }
      const chord = chordFromEvent(e);
      if (chord) ref.current.onChord(chord);
    };
    const swallow = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", swallow, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", swallow, true);
    };
  }, [active]);
}
