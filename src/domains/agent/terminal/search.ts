import { type ISearchOptions, SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";

// Find in scrollback, through xterm's search addon. One addon per terminal, loaded
// with it (so it's disposed with it). Matches are drawn as decorations, which xterm
// paints itself and so needs as literal `#rrggbb` colours: they're mixed from the
// accent token over the terminal's own background, so they follow every theme.

const addons = new WeakMap<Terminal, SearchAddon>();

/** Give a terminal its search addon. */
export function installSearch(term: Terminal): void {
  const addon = new SearchAddon({ highlightLimit: 2000 });
  term.loadAddon(addon);
  addons.set(term, addon);
}

type Rgb = [number, number, number];

/** A CSS colour (any syntax the webview knows, oklch and color-mix included) as RGB. */
function toRgb(css: string): Rgb | null {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !css) return null;
  // An unparsable colour leaves fillStyle as it was rather than throwing, so check.
  const sentinel = "#010203";
  ctx.fillStyle = sentinel;
  ctx.fillStyle = css;
  if (ctx.fillStyle === sentinel && css.toLowerCase() !== sentinel) return null;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

const hex = (rgb: Rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/** `a` laid over `b` at `amount` (0–1). */
const mix = (a: Rgb, b: Rgb, amount: number): Rgb =>
  [0, 1, 2].map((i) => Math.round(a[i] * amount + b[i] * (1 - amount))) as Rgb;

/** Match colours for this terminal under the current theme. */
function decorations(term: Terminal): NonNullable<ISearchOptions["decorations"]> {
  const accentCss = getComputedStyle(document.documentElement).getPropertyValue("--c-accent");
  const theme = term.options.theme;
  const bg = toRgb(theme?.background ?? "") ?? [0, 0, 0];
  // No accent to read (it always resolves in the app): the text colour still contrasts.
  const accent = toRgb(accentCss.trim()) ?? toRgb(theme?.foreground ?? "") ?? [128, 128, 128];
  const match = hex(mix(accent, bg, 0.3));
  const active = hex(mix(accent, bg, 0.65));
  return {
    matchBackground: match,
    matchOverviewRuler: match,
    activeMatchBackground: active,
    activeMatchBorder: hex(accent),
    activeMatchColorOverviewRuler: active,
  };
}

/** What a search looks for besides the text. */
export interface FindFlags {
  caseSensitive: boolean;
  regex: boolean;
}

/**
 * Move to the next (or previous) match of `query`, highlighting all of them. With
 * `incremental`, a match that still fits a lengthened query stays put (typing).
 * Returns false when nothing matches (or the regex doesn't parse).
 */
export function findInTerminal(
  term: Terminal,
  query: string,
  flags: FindFlags,
  dir: "next" | "prev",
  incremental = false
): boolean {
  const addon = addons.get(term);
  if (!addon) return false;
  const options: ISearchOptions = { ...flags, incremental, decorations: decorations(term) };
  try {
    return dir === "next" ? addon.findNext(query, options) : addon.findPrevious(query, options);
  } catch {
    return false; // a half-typed regex
  }
}

/** Count updates while the find bar is open: the active match (0-based, -1 if none) and total. */
export function onFindResults(
  term: Terminal,
  listener: (index: number, count: number) => void
): () => void {
  const sub = addons.get(term)?.onDidChangeResults((r) => listener(r.resultIndex, r.resultCount));
  return () => sub?.dispose();
}

/**
 * Clear the highlights (the query emptied, or the find bar closed). The selection
 * stays: it's the last match, or what the user had selected before searching.
 */
export function clearFind(term: Terminal): void {
  addons.get(term)?.clearDecorations();
}

// A hot update would leave live terminals' addons in a stale map, so reload instead.
import.meta.hot?.accept(() => location.reload());
