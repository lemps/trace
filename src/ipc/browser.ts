import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Typed wrappers around `commands/browser.rs`: a workspace's Browser tab (its pages
// and their URL history) and the native webview each page shows in. Mirrors
// `browser::store` and `browser::webview`.

export type Opener = "agent" | "user";
export type Reach = "loopback" | "external";

export interface BrowserPage {
  id: string;
  title: string;
  url: string;
  /** Where the page has been, oldest first. */
  history: string[];
  openedBy: Opener;
  updatedAt: number;
}

export interface BrowserFile {
  pages: BrowserPage[];
  active: string | null;
}

export interface Opened {
  page: BrowserPage;
  reach: Reach;
  /** "localhost:5173", "example.com". */
  host: string;
}

/** Where a page goes, in the window's physical pixels. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BrowserAction = "back" | "forward" | "reload" | "stop";

export type ViewEvent =
  | { kind: "loading"; url: string }
  | { kind: "loaded"; url: string; host: string; external: boolean }
  | { kind: "title"; title: string }
  | { kind: "blocked"; url: string; reason: string; download: boolean };

export type ViewPayload = ViewEvent & { workspaceId: string; pageId: string };

export function browserPages(workspaceId: string): Promise<BrowserFile> {
  return invoke("browser_pages", { workspaceId });
}

export function browserOpen(
  workspaceId: string,
  url: string,
  opts: { title?: string | null; newTab?: boolean; by: Opener }
): Promise<Opened> {
  return invoke("browser_open", {
    workspaceId,
    url,
    title: opts.title ?? null,
    newTab: opts.newTab ?? false,
    by: opts.by,
  });
}

export function browserGo(workspaceId: string, pageId: string, url: string): Promise<BrowserPage> {
  return invoke("browser_go", { workspaceId, pageId, url });
}

export function browserSelect(workspaceId: string, pageId: string): Promise<void> {
  return invoke("browser_select", { workspaceId, pageId });
}

export function browserClose(workspaceId: string, pageId: string): Promise<void> {
  return invoke("browser_close", { workspaceId, pageId });
}

export function browserShow(workspaceId: string, pageId: string, bounds: Bounds): Promise<void> {
  return invoke("browser_show", { workspaceId, pageId, bounds });
}

export function browserHide(workspaceId: string, pageId: string): Promise<void> {
  return invoke("browser_hide", { workspaceId, pageId });
}

export function browserAct(
  workspaceId: string,
  pageId: string,
  action: BrowserAction
): Promise<void> {
  return invoke("browser_act", { workspaceId, pageId, action });
}

/** A page started or finished loading, got a title, or was refused something. */
export function onBrowserView(cb: (p: ViewPayload) => void): Promise<UnlistenFn> {
  return listen<ViewPayload>("browser-view", (e) => cb(e.payload));
}

/** A workspace's pages changed backend-side (an agent opened one). */
export function onBrowserPages(cb: (p: { workspaceId: string }) => void): Promise<UnlistenFn> {
  return listen<{ workspaceId: string }>("browser-pages", (e) => cb(e.payload));
}
