import type { Os } from "../os.ts";
import { formatChord } from "./chord.ts";

// How a shortcut is written beside what it does, once hints are off the buttons:
// in a tooltip ("Back to Sessions (Esc)") and in the cheat sheet.

/** A tooltip naming its shortcut: "Interrupt (Esc)", or just the label with none bound. */
export function titleWithHint(label: string, chord: string): string {
  return chord ? `${label} (${chord})` : label;
}

/** A numbered binding (`Alt+#`) as it reads for one number: "Alt+3", or "3" when bare. */
export function numberedHint(binding: string | undefined, n: number, os: Os): string {
  if (!binding) return "";
  return formatChord(binding.endsWith("#") ? `${binding.slice(0, -1)}${n}` : binding, os);
}

/** The `aria-keyshortcuts` form of a chord ("Control+Shift+K"), or undefined for a click. */
export function ariaKeys(binding: string | undefined): string | undefined {
  if (!binding || binding.endsWith("Click") || binding.endsWith("#")) return undefined;
  return binding
    .split("+")
    .map((part) => (part === "Ctrl" ? "Control" : part.length === 1 ? part.toUpperCase() : part))
    .join("+");
}
