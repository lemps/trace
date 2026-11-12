import { useEffect, useState } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { currentOs } from "@/platform/os";
import { formatChord } from "@/platform/shortcuts/chord";
import { useKeymapStore } from "@/platform/shortcuts/keymap";
import type { ShortcutDef } from "@/platform/shortcuts/registry";
import { asBinding, bindingProblem } from "@/platform/shortcuts/rules";
import { useChordRecorder } from "./hooks/useChordRecorder";

const NONE: string[] = [];

interface ShortcutRowProps {
  def: ShortcutDef;
  /** Other shortcuts this one collides with now (e.g. a default that changed). */
  clashesWith: string[];
  /** Recording new keys; one row at a time, so the parent holds it. */
  isRecording: boolean;
  setRecording: (on: boolean) => void;
}

// One shortcut: its keys, and — unless it's built in — a button that records new ones.
// A chord the rules refuse is explained in place and nothing changes. The note line
// and the reset button keep their room when empty, so recording, rebinding and
// resetting never move the row or the keys button.
export function ShortcutRow({ def, clashesWith, isRecording, setRecording }: ShortcutRowProps) {
  const chords = useKeymapStore((s) => s.keymap[def.id] ?? NONE);
  const isOverridden = useKeymapStore((s) => def.id in s.overrides);
  const rebind = useKeymapStore((s) => s.rebind);
  const reset = useKeymapStore((s) => s.reset);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!isRecording) setProblem(null);
  }, [isRecording]);

  useChordRecorder(
    isRecording,
    (pressed) => {
      const chord = asBinding(def, pressed);
      const why = bindingProblem(def, chord, useKeymapStore.getState().keymap, currentOs);
      setProblem(why);
      if (why) return; // keep listening: the next press may be fine
      rebind(def.id, [chord]);
      setRecording(false);
    },
    () => setRecording(false)
  );

  const keys = chords.map((c) => (
    <span key={c} className="kbd">
      {formatChord(c, currentOs)}
    </span>
  ));
  const clash =
    clashesWith.length > 0 ? `Same keys as “${clashesWith.join("”, “")}”. Rebind one.` : null;
  const note = isRecording
    ? (problem ??
      (chords.length > 1
        ? `Press the new keys; they replace all ${chords.length}. Esc cancels.`
        : "Press the new keys. Esc cancels."))
    : (clash ?? (def.isFixed ? "Built in" : null));

  const canReset = isOverridden && !isRecording;

  return (
    <div className="setting-row sc-row">
      <div>
        <div className="label">{def.label}</div>
        <div className={problem || clash ? "hint sc-problem" : "hint"}>{note ?? "\u00a0"}</div>
      </div>
      <div className="control">
        {def.isFixed ? (
          <span className="sc-keys">{keys}</span>
        ) : (
          <button
            type="button"
            className={isRecording ? "btn sc-keys recording" : "btn sc-keys"}
            aria-label={`Change the keys for ${def.label}`}
            onClick={() => setRecording(!isRecording)}
          >
            {isRecording ? "Press keys…" : keys}
          </button>
        )}
        <IconButton
          label={`Reset ${def.label} to its default`}
          className={canReset ? undefined : "sc-reset-off"}
          aria-hidden={!canReset || undefined}
          disabled={!canReset}
          tabIndex={canReset ? undefined : -1}
          onClick={() => reset(def.id)}
        >
          <I.RotateCcw size={14} />
        </IconButton>
      </div>
    </div>
  );
}
