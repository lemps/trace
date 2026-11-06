import { currentOs } from "./os";

// App shortcuts per OS. macOS has a modifier the terminal never sees. Elsewhere `Ctrl`
// is the terminal's (Ctrl+C interrupts, Ctrl+K kills a line, Ctrl+J is a newline), so
// app shortcuts add Shift, as terminal emulators do on those systems.

const isMac = currentOs === "macos";

/** The parts of a key event shortcuts look at; DOM and React events both fit. */
interface KeyChord {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Ctrl+Shift, the app's chord off macOS. */
function appChord(e: KeyChord): boolean {
  return e.ctrlKey && e.shiftKey && !e.altKey;
}

const lower = (e: KeyChord) => e.key.toLowerCase();

/** Show or fold the orchestrator. */
export function isOrchestratorKey(e: KeyChord): boolean {
  if (lower(e) !== "j") return false;
  return isMac ? (e.metaKey || e.ctrlKey) && !e.shiftKey : appChord(e);
}

/** Jump to the next agent needing you. */
export function isNextAgentKey(e: KeyChord): boolean {
  if (lower(e) !== "n") return false;
  return isMac ? (e.metaKey || e.ctrlKey) && e.shiftKey : appChord(e);
}

/** Focus the search box. Shift+/ reads as "?" on most layouts. */
export function isSearchKey(e: KeyChord): boolean {
  if (isMac) return (e.metaKey || e.ctrlKey) && (e.key === "/" || e.key === "k");
  return appChord(e) && (lower(e) === "k" || e.key === "/" || e.key === "?");
}

/** Which tab (0-based) a number shortcut picks, or null. */
export function tabKeyIndex(e: KeyChord): number | null {
  if (e.key < "1" || e.key > "9" || e.key.length !== 1 || e.shiftKey) return null;
  const held = isMac ? e.metaKey : e.ctrlKey && !e.altKey;
  return held ? Number(e.key) - 1 : null;
}

/** Enter with this held sends a reply and moves on. */
export function isSendAndNext(e: KeyChord): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

/** Whether a click on a terminal link is an explicit "open this" while a TUI owns the mouse. */
export function isLinkClick(e: { altKey: boolean; metaKey: boolean; ctrlKey: boolean }): boolean {
  return e.altKey || (isMac ? e.metaKey : e.ctrlKey);
}

/** Copy from a terminal. macOS's ⌘C reaches the webview on its own. */
export function isTerminalCopy(e: KeyChord): boolean {
  return !isMac && appChord(e) && lower(e) === "c";
}

/** Paste into a terminal. macOS's ⌘V reaches the webview on its own. */
export function isTerminalPaste(e: KeyChord): boolean {
  return !isMac && appChord(e) && lower(e) === "v";
}

/**
 * Whether a focused terminal should leave this key for the app. xterm stops the keys it
 * handles from reaching the window, which macOS's ⌘ chords avoid by not being terminal
 * input at all.
 */
export function isAppKey(e: KeyChord): boolean {
  if (isMac) return false;
  return isOrchestratorKey(e) || isNextAgentKey(e) || isSearchKey(e) || tabKeyIndex(e) !== null;
}

/** Shortcut labels, in the form this OS writes them. */
export const hints = isMac
  ? {
      orchestrator: "⌘J",
      nextAgent: "⌘⇧N",
      search: "⌘ /",
      sendAndNext: "⌘⏎",
      moveUp: "⌥↑",
      moveDown: "⌥↓",
      altClick: "⌥-click",
    }
  : {
      orchestrator: "Ctrl+Shift+J",
      nextAgent: "Ctrl+Shift+N",
      search: "Ctrl+Shift+K",
      sendAndNext: "Ctrl+⏎",
      moveUp: "Alt+↑",
      moveDown: "Alt+↓",
      altClick: "Alt-click",
    };
