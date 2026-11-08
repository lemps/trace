import { useEffect } from "react";
import { create } from "zustand";
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
import { browserTabVisible } from "./model";

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
  unseen: Record<string, boolean>;
  revealed: Record<string, boolean>;
  ensure: (ws: string) => void;
  reload: (ws: string) => Promise<void>;
  openUrl: (ws: string, url: string, newTab: boolean) => Promise<void>;
  go: (ws: string, pageId: string, url: string) => Promise<void>;
  select: (ws: string, pageId: string) => void;
  close: (ws: string, pageId: string) => Promise<void>;
  onView: (p: ViewPayload) => void;
  notify: (ws: string, pageId: string, host: string | null) => void;
  dismiss: (pageId: string) => void;
  markSeen: (ws: string) => void;
  reveal: (ws: string, on: boolean) => void;
}

function patchLive(s: BrowserStore, pageId: string, patch: Partial<PageLive>) {
  return { live: { ...s.live, [pageId]: { ...(s.live[pageId] ?? IDLE), ...patch } } };
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  files: {},
  loaded: {},
  live: {},
  notices: {},
  unseen: {},
  revealed: {},
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
    await get().reload(ws);
    // The last page gone: the tab goes too, as it came.
    if ((get().files[ws] ?? EMPTY).pages.length === 0) get().reveal(ws, false);
  },
  onView(p) {
    switch (p.kind) {
      case "loading":
        set((s) => patchLive(s, p.pageId, { loading: true, url: p.url }));
        break;
      case "loaded":
        set((s) => patchLive(s, p.pageId, { loading: false, url: p.url }));
        // The backend added it to the page's history.
        if (get().loaded[p.workspaceId]) setTimeout(() => void get().reload(p.workspaceId), 300);
        break;
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
    }));
  },
  dismiss(pageId) {
    const { [pageId]: _, ...rest } = get().notices;
    set((s) => ({ notices: rest, ...patchLive(s, pageId, { blocked: null }) }));
  },
  markSeen(ws) {
    if (get().unseen[ws]) set((s) => ({ unseen: { ...s.unseen, [ws]: false } }));
  },
  reveal(ws, on) {
    set((s) => ({ revealed: { ...s.revealed, [ws]: on } }));
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

/** What the tab row needs: whether Browser shows, and whether it has news. */
export interface BrowserTabState {
  visible: boolean;
  /** Shown only because the user opened it empty: its tab closes it again. */
  peeking: boolean;
  unseen: boolean;
  count: number;
}

export function useBrowserTab(ws: string): BrowserTabState {
  const file = useBrowserFile(ws);
  const revealed = useBrowserStore((s) => s.revealed[ws] ?? false);
  const unseen = useBrowserStore((s) => s.unseen[ws] ?? false);
  const count = file.pages.length;
  return {
    visible: browserTabVisible(count, revealed),
    peeking: revealed && count === 0,
    unseen,
    count,
  };
}
