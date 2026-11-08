import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useSavedPrompts } from "@/domains/savedPrompts/store";
import { type SlashEntry, slashEntries, slashMatches } from "../slash";

export interface Slash {
  /** Everything `/` offers: saved prompts and the agent's commands. */
  entries: SlashEntry[];
  /** What the menu lists for the text, or null when it's not showing. */
  matches: SlashEntry[] | null;
  active: number;
  pick: (entry: SlashEntry) => void;
  /** The text was edited: back to the top row, and the menu may show again. */
  reset: () => void;
  /** Arrow keys, Tab/Enter and Esc while the menu shows; true when it took the key. */
  onKey: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

// The composer's slash menu: what it lists, which row is picked, and its keys.
// Picking a command types `/command `; picking a saved prompt puts its text in the
// box to edit, not sending it.
export function useSlash(
  text: string,
  setText: (text: string) => void,
  commands: readonly string[]
): Slash {
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState(false);
  const prompts = useSavedPrompts((s) => s.prompts);
  useEffect(() => useSavedPrompts.getState().ensure(), []);
  const entries = useMemo(() => slashEntries(commands, prompts), [commands, prompts]);
  const matches = closed ? null : slashMatches(text, entries);

  const pick = (entry: SlashEntry) => {
    setText(entry.saved ? entry.saved.body : `/${entry.label} `);
    setActive(0);
  };
  const reset = () => {
    setActive(0);
    setClosed(false);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!matches) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + matches.length) % matches.length);
      return true;
    }
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      pick(matches[Math.min(active, matches.length - 1)]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setClosed(true);
      return true;
    }
    return false;
  };
  return { entries, matches, active, pick, reset, onKey };
}
