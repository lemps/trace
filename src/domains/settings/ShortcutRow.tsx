import { useEffect, useState } from "react";
import { I } from "@/components/Icon";
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
// A chord the rules refuse is explained in place and nothing changes.
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
    ? (problem ?? "Press the new keys. Esc cancels.")
    : (clash ?? (def.isFixed ? "Built in" : null));

  return (
    <div className="setting-row sc-row">
      <div>
        <div className="label">{def.label}</div>
        {note && <div className={problem || clash ? "hint sc-problem" : "hint"}>{note}</div>}
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
        {isOverridden && !isRecording && (
          <button
            type="button"
            className="btn icon"
            aria-label={`Reset ${def.label} to its default`}
            title="Reset to default"
            onClick={() => reset(def.id)}
          >
            <I.Refresh size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
