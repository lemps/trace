import type { BrowserPage } from "../../ipc/browser.ts";

// The Browser tab's pure rules: what a typed address means, and how a page is
// named. When the tab shows is the tabs rule's (panes/coming.ts).

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LOCAL = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?([/?#]|$)/i;
const HOST = /^[^\s/?#]+\.[^\s/?#]+(:\d+)?([/?#]|$)/;

/**
 * What the user meant by what they typed in the address bar, or null if it isn't an
 * address. `5173` and `:5173` are a local port; `localhost:3000` is http; a bare
 * domain is https. Anything with a scheme goes to the backend as typed, which
 * refuses all but http and https and says so.
 */
export function typedUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^\d{2,5}$/.test(text)) return `http://localhost:${text}`;
  if (/^:\d{2,5}([/?#]|$)/.test(text)) return `http://localhost${text}`;
  if (LOCAL.test(text)) return `http://${text}`;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  // `example.com:8080` and `localhost:5173` look like a scheme, so hosts go first.
  if (HOST.test(text)) return `https://${text}`;
  if (SCHEME.test(text)) return text;
  return null;
}

/** "localhost:5173", "example.com"; the URL itself if it doesn't parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** What a page's tab says: its title, else the document's, else its host. */
export function pageLabel(page: BrowserPage, liveTitle?: string): string {
  return page.title || liveTitle || hostOf(page.url);
}

/** Addresses for the address bar's suggestions, newest first, without repeats. */
export function suggestions(pages: readonly BrowserPage[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const all = [...pages].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const page of all) {
    for (const url of [...page.history].reverse()) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }
  return out.slice(0, 50);
}
