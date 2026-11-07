import { openUrl } from "@tauri-apps/plugin-opener";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ILink, Terminal } from "@xterm/xterm";
import { isLinkClick } from "@/platform/shortcuts";
import { findPaths } from "./paths";
import { workspaceOf } from "./source";
import { type LinkTarget, useTerminalUi } from "./store";

// Links in a terminal: URLs (plain text and OSC 8) and file paths. A click offers
// what can be done with one in a small menu (`TerminalOverlay`); a ⌘/Ctrl-click on a
// URL opens it straight away, as native terminals do.
//
// When the foreground app has mouse reporting on, a plain click belongs to the app,
// not us: xterm forwards it, and Claude Code's fullscreen TUI (which turns reporting
// on — `?1000/1002/1003h` right after `?1049h`) uses clicks for its own
// selection/copy; acting here too once meant two tabs per click. Cmd- and
// Option-click stay ours, matching native terminals (Claude Code ≥ 2.1.181 expects
// the emulator to own Cmd+click): the xterm mouse protocol has no meta bit, so the
// app can never even see a Cmd+click, and xterm treats alt-clicks as a selection
// gesture and never reports them. Off macOS, Ctrl-click takes Cmd-click's place.

/** Only http(s) opens: terminal bytes are untrusted, and other schemes can do more. */
export function isWebUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

/** Open a link in the system browser (the webview can't `window.open`). */
export function openWebUrl(uri: string): void {
  if (isWebUrl(uri)) void openUrl(uri);
}

/** The link under the pointer in each terminal, for the right-click menu. */
const hovered = new Map<string, LinkTarget>();

function onClick(key: string, term: Terminal, event: MouseEvent, link: LinkTarget): void {
  const explicit = isLinkClick(event);
  if (term.modes.mouseTrackingMode !== "none" && !explicit) return;
  if (link.kind === "url" && explicit && isWebUrl(link.url)) {
    openWebUrl(link.url);
    return;
  }
  useTerminalUi
    .getState()
    .openMenu(key, { x: event.clientX, y: event.clientY, link, isContext: false });
}

const hoverHandlers = (key: string, link: LinkTarget) => ({
  hover: () => {
    hovered.set(key, link);
  },
  leave: () => {
    if (hovered.get(key) === link) hovered.delete(key);
  },
});

/** xterm's handler for OSC 8 hyperlinks (ignored unless one is set). */
export function oscLinkHandler(key: string, term: Terminal) {
  return {
    activate: (event: MouseEvent, uri: string) =>
      onClick(key, term, event, { kind: "url", url: uri }),
    hover: (_e: MouseEvent, uri: string) => hovered.set(key, { kind: "url", url: uri }),
    leave: () => hovered.delete(key),
  };
}

/** File paths on one buffer row, as xterm links (1-based, inclusive cell ranges). */
function fileLinks(key: string, term: Terminal, y: number): ILink[] | undefined {
  const row = term.buffer.active.getLine(y - 1);
  if (!row) return undefined;
  const links = findPaths(row.translateToString(true)).map((m): ILink => {
    const target: LinkTarget = { kind: "file", path: m.path, line: m.line, col: m.col };
    return {
      range: { start: { x: m.start + 1, y }, end: { x: m.end, y } },
      text: m.path,
      decorations: { underline: true, pointerCursor: true },
      activate: (event) => onClick(key, term, event, target),
      ...hoverHandlers(key, target),
    };
  });
  return links.length > 0 ? links : undefined;
}

/**
 * Make a terminal's URLs and file paths clickable, and give it a right-click menu
 * (the mouse path to find and Copy Context). File paths only link where they can be
 * opened: a scheduled run's terminal has no workspace to open them in.
 */
export function installLinks(key: string, term: Terminal, container: HTMLElement): void {
  term.loadAddon(
    new WebLinksAddon((event, uri) => onClick(key, term, event, { kind: "url", url: uri }), {
      hover: (_e, uri) => hovered.set(key, { kind: "url", url: uri }),
      leave: () => hovered.delete(key),
    })
  );
  if (workspaceOf(key)) {
    term.registerLinkProvider({ provideLinks: (y, done) => done(fileLinks(key, term, y)) });
  }
  // Right-click is ours, never the app's: stop xterm seeing the press (it would
  // report it to a mouse-tracking TUI, or select a word) and show the menu instead.
  container.addEventListener(
    "mousedown",
    (e) => {
      if (e.button === 2) e.stopPropagation();
    },
    true
  );
  container.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    // xterm shows the hand only while a link is under the pointer; a missed `leave`
    // (the pointer went onto a menu over the terminal) mustn't offer a stale link.
    const isOnLink = container.querySelector(".xterm-cursor-pointer") !== null;
    useTerminalUi.getState().openMenu(key, {
      x: e.clientX,
      y: e.clientY,
      link: isOnLink ? (hovered.get(key) ?? null) : null,
      isContext: true,
    });
  });
}

/** Forget a disposed terminal's hover state. */
export function forgetLinks(key: string): void {
  hovered.delete(key);
}
