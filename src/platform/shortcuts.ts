import { currentOs } from "./os";
import { chordFromEvent, formatChord, type KeyChord, matchIndex } from "./shortcuts/chord";
import { useKeymapStore } from "./shortcuts/keymap";
import { SHORTCUTS } from "./shortcuts/registry";

// What the app asks about keys. Every answer comes from the registry
// (`shortcuts/registry.ts`) with the user's rebindings applied, so handlers and the
// hints beside them follow Settings → Shortcuts.

const isMac = currentOs === "macos";

/**
 * Whether a key event is the shortcut `id`: null if not, else the 0-based number it
 * picked (a `#` binding like ⌘1–9) or 0.
 */
export function shortcutIndex(id: string, e: KeyChord): number | null {
  const pressed = chordFromEvent(e);
  if (!pressed) return null;
  for (const binding of useKeymapStore.getState().keymap[id] ?? []) {
    const index = matchIndex(binding, pressed);
    if (index !== null) return index;
  }
  return null;
}

export function isShortcut(id: string, e: KeyChord): boolean {
  return shortcutIndex(id, e) !== null;
}

/** Show or fold the orchestrator. */
export const isOrchestratorKey = (e: KeyChord) => isShortcut("orchestrator", e);

/** Jump to the next agent needing you. */
export const isNextAgentKey = (e: KeyChord) => isShortcut("nextAgent", e);

/** Focus the search box. */
export const isSearchKey = (e: KeyChord) => isShortcut("search", e);

/** Flip the agent in view between its formatted transcript and its terminal. */
export const isAgentViewKey = (e: KeyChord) => isShortcut("agentView", e);

/** Which tab (0-based) a number shortcut picks, or null. */
export const tabKeyIndex = (e: KeyChord) => shortcutIndex("detailTab", e);

/** This chord sends a reply and moves on. */
export const isSendAndNext = (e: KeyChord) => isShortcut("sendAndNext", e);

/** Whether a click on a terminal link is an explicit "open this" while a TUI owns the mouse. */
export function isLinkClick(e: { altKey: boolean; metaKey: boolean; ctrlKey: boolean }): boolean {
  return e.altKey || (isMac ? e.metaKey : e.ctrlKey);
}

/** Copy from a terminal. macOS's ⌘C reaches the webview on its own. */
export const isTerminalCopy = (e: KeyChord) => !isMac && isShortcut("termCopy", e);

/** Paste into a terminal. macOS's ⌘V reaches the webview on its own. */
export const isTerminalPaste = (e: KeyChord) => !isMac && isShortcut("termPaste", e);

const APP_SCOPES = new Set(["app", "detail"]);
const APP_IDS = SHORTCUTS.filter((s) => APP_SCOPES.has(s.scope) && !s.isFixed).map((s) => s.id);

/**
 * Whether a focused terminal should leave this key for the app. xterm stops the keys
 * it handles from reaching the window; the rules keep every app binding off the keys
 * a terminal needs, so handing these over never takes one from it.
 */
export function isAppKey(e: KeyChord): boolean {
  return APP_IDS.some((id) => isShortcut(id, e));
}

/** A shortcut's main chord as this OS writes it ("⌘⇧N", "Ctrl+Shift+N"). */
export function hint(id: string): string {
  const chord = useKeymapStore.getState().keymap[id]?.[0];
  return chord ? formatChord(chord, currentOs) : "";
}

/** `hint`, re-rendering when the shortcut is rebound. */
export function useHint(id: string): string {
  const chord = useKeymapStore((s) => s.keymap[id]?.[0]);
  return chord ? formatChord(chord, currentOs) : "";
}
