import { openUrl } from "@tauri-apps/plugin-opener";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ILink, Terminal } from "@xterm/xterm";
import { isLinkClick } from "@/platform/shortcuts";
import { linkAt, linksOnLine } from "./rowLinks";
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

/** xterm's handler for OSC 8 hyperlinks (ignored unless one is set). */
export function oscLinkHandler(key: string, term: Terminal) {
  return {
    activate: (event: MouseEvent, uri: string) =>
      onClick(key, term, event, { kind: "url", url: uri }),
  };
}

/**
 * File paths on one buffer row (1-based), as xterm links: matched on the whole
 * logical line, so wide characters and soft-wrapped paths land on the right cells.
 */
function fileLinks(key: string, term: Terminal, y: number): ILink[] | undefined {
  const links = linksOnLine(term.buffer.active, y - 1, false)
    .filter((l) => l.start.y <= y - 1 && l.end.y >= y - 1)
    .map(
      (l): ILink => ({
        range: {
          start: { x: l.start.x + 1, y: l.start.y + 1 },
          end: { x: l.end.x + l.end.width, y: l.end.y + 1 },
        },
        text: l.text,
        decorations: { underline: true, pointerCursor: true },
        activate: (event) => onClick(key, term, event, l.target),
      })
    );
  return links.length > 0 ? links : undefined;
}

/** The buffer cell under a pointer event, or null off the grid. */
function cellAt(term: Terminal, container: HTMLElement, e: MouseEvent) {
  const screen = container.querySelector(".xterm-screen")?.getBoundingClientRect();
  if (!screen || screen.width === 0 || screen.height === 0) return null;
  const x = Math.floor(((e.clientX - screen.left) / screen.width) * term.cols);
  const row = Math.floor(((e.clientY - screen.top) / screen.height) * term.rows);
  if (x < 0 || x >= term.cols || row < 0 || row >= term.rows) return null;
  return { x, y: row + term.buffer.active.viewportY };
}

/**
 * Make a terminal's URLs and file paths clickable, and give it a right-click menu
 * (the mouse path to find and Copy Context). File paths only link where they can be
 * opened: a scheduled run's terminal has no workspace to open them in.
 */
export function installLinks(key: string, term: Terminal, container: HTMLElement): void {
  term.loadAddon(
    new WebLinksAddon((event, uri) => onClick(key, term, event, { kind: "url", url: uri }))
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
    // The link under the pointer is read from the cells, not from hover state.
    const cell = cellAt(term, container, e);
    const found = cell ? linkAt(term.buffer.active, cell.x, cell.y) : null;
    // A scheduled run's terminal has no workspace to open a path in; its URLs still work.
    const link = found?.kind === "file" && workspaceOf(key) === null ? null : found;
    useTerminalUi.getState().openMenu(key, {
      x: e.clientX,
      y: e.clientY,
      link,
      isContext: true,
    });
  });
}
