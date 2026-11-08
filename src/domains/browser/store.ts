import { useEffect } from "react";
import { create } from "zustand";
import { type Coming, useComing } from "@/domains/panes/coming";
import {
  type BrowserFile,
  type BrowserPage,
  browserClose,
  browserGo,
  browserOpen,
  browserPages,
  browserSelect,
  type ViewPayload,
} from "@/ipc/browser";
import { BROWSER_TAB } from "./browserTabId";

// Each workspace's Browser tab in the renderer: its pages as the backend keeps them
// (`browser::store`), what each live page is doing (loading, its title, the URL it's
// at, from `browser-view`), the "agent opened <host>" notices, whether something
// new arrived unseen, and whether the user opened the tab empty from the pane menu.

const EMPTY: BrowserFile = { pages: [], active: null };
const latestLoad: Record<string, number> = {};

export interface PageLive {
  loading: boolean;
  title: string;
  url: string;
  /** The last thing the page was refused (a scheme, a download), until dismissed. */
  blocked: { url: string; reason: string; download: boolean } | null;
}

const IDLE: PageLive = { loading: false, title: "", url: "", blocked: null };

interface BrowserStore {
  files: Record<string, BrowserFile>;
  loaded: Record<string, boolean>;
  /** By page id (unique across workspaces). */
  live: Record<string, PageLive>;
  /** Page id → the host an agent opened in it, until dismissed. */
  notices: Record<string, string>;
  /** Page id → the host whose notice was dismissed (it isn't raised again). */
  dismissed: Record<string, string>;
  unseen: Record<string, boolean>;
  ensure: (ws: string) => void;
  reload: (ws: string) => Promise<void>;
  openUrl: (ws: string, url: string, newTab: boolean) => Promise<void>;
  go: (ws: string, pageId: string, url: string) => Promise<void>;
  select: (ws: string, pageId: string) => void;
  close: (ws: string, pageId: string) => Promise<void>;
  onView: (p: ViewPayload) => void;
  notify: (ws: string, pageId: string, host: string | null) => void;
  /** Dismiss the "agent opened <host>" notice. */
  dismiss: (pageId: string) => void;
  /** Dismiss what the page was refused. */
  clearBlocked: (pageId: string) => void;
  markSeen: (ws: string) => void;
}

function patchLive(s: BrowserStore, pageId: string, patch: Partial<PageLive>) {
  return { live: { ...s.live, [pageId]: { ...(s.live[pageId] ?? IDLE), ...patch } } };
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  files: {},
  loaded: {},
  live: {},
  notices: {},
  dismissed: {},
  unseen: {},
  ensure(ws) {
    if (get().loaded[ws]) return;
    set((s) => ({ loaded: { ...s.loaded, [ws]: true } }));
    void get().reload(ws);
  },
  async reload(ws) {
    const ticket = (latestLoad[ws] ?? 0) + 1;
    latestLoad[ws] = ticket;
    const file = await browserPages(ws).catch(() => null);
    if (!file || latestLoad[ws] !== ticket) return;
    set((s) => ({ files: { ...s.files, [ws]: file } }));
  },
  async openUrl(ws, url, newTab) {
    await browserOpen(ws, url, { newTab, by: "user" });
    await get().reload(ws);
  },
  async go(ws, pageId, url) {
    set((s) => patchLive(s, pageId, { blocked: null }));
    await browserGo(ws, pageId, url);
    await get().reload(ws);
  },
  select(ws, pageId) {
    const file = get().files[ws] ?? EMPTY;
    set((s) => ({ files: { ...s.files, [ws]: { ...file, active: pageId } } }));
    void browserSelect(ws, pageId).catch(() => {});
  },
  async close(ws, pageId) {
    await browserClose(ws, pageId);
    get().dismiss(pageId);
    get().clearBlocked(pageId);
    await get().reload(ws);
  },
  onView(p) {
    switch (p.kind) {
      case "loading":
        set((s) => patchLive(s, p.pageId, { loading: true, url: p.url }));
        break;
      case "loaded": {
        set((s) => patchLive(s, p.pageId, { loading: false, url: p.url }));
        // An agent's page that ends up on another host (a redirect, a link) says so too.
        const s = get();
        const page = s.files[p.workspaceId]?.pages.find((x) => x.id === p.pageId);
        const seen = s.notices[p.pageId] === p.host || s.dismissed[p.pageId] === p.host;
        if (p.external && page?.openedBy === "agent" && !seen) {
          set((st) => ({ notices: { ...st.notices, [p.pageId]: p.host } }));
        }
        // Its history reloads when the backend has written it (`browser-pages`).
        break;
      }
      case "title":
        set((s) => patchLive(s, p.pageId, { title: p.title }));
        break;
      case "blocked":
        set((s) =>
          patchLive(s, p.pageId, {
            blocked: { url: p.url, reason: p.reason, download: p.download },
          })
        );
        break;
    }
  },
  notify(ws, pageId, host) {
    set((s) => ({
      unseen: { ...s.unseen, [ws]: true },
      notices: host ? { ...s.notices, [pageId]: host } : s.notices,
      // The agent opened it again: say so again.
      dismissed: { ...s.dismissed, [pageId]: "" },
    }));
  },
  dismiss(pageId) {
    const { [pageId]: host, ...rest } = get().notices;
    set((s) => ({
      notices: rest,
      dismissed: host ? { ...s.dismissed, [pageId]: host } : s.dismissed,
    }));
  },
  clearBlocked(pageId) {
    set((s) => patchLive(s, pageId, { blocked: null }));
  },
  markSeen(ws) {
    if (get().unseen[ws]) set((s) => ({ unseen: { ...s.unseen, [ws]: false } }));
  },
}));

/** A workspace's pages (loaded on first use). */
export function useBrowserFile(ws: string): BrowserFile {
  const ensure = useBrowserStore((s) => s.ensure);
  useEffect(() => ensure(ws), [ensure, ws]);
  return useBrowserStore((s) => s.files[ws] ?? EMPTY);
}

export function usePageLive(pageId: string | null): PageLive {
  return useBrowserStore((s) => (pageId ? (s.live[pageId] ?? IDLE) : IDLE));
}

export function activePage(file: BrowserFile): BrowserPage | null {
  return file.pages.find((p) => p.id === file.active) ?? file.pages[file.pages.length - 1] ?? null;
}

/** What the tab row needs: whether Browser shows (the tabs rule), and whether it has news. */
export interface BrowserTabState {
  coming: Coming;
  unseen: boolean;
  count: number;
}

export function useBrowserTab(ws: string): BrowserTabState {
  const file = useBrowserFile(ws);
  const unseen = useBrowserStore((s) => s.unseen[ws] ?? false);
  const count = file.pages.length;
  // A new page brings a hidden tab back; navigating one already open doesn't.
  const signature = file.pages.map((p) => p.id).join(",");
  return {
    coming: useComing(BROWSER_TAB, ws, count > 0, signature),
    unseen,
    count,
  };
}
