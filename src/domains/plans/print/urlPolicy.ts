// What an agent's HTML may point at once its print copy is in trace's own page.
// On screen the document sits in `sandbox=""`, an opaque origin with nothing of
// trace's; the print copy is rendered into trace's document (a shadow root), so
// everything here is an allow-list. Pure, so it's tested without a DOM.

/**
 * A URL attribute as the browser's URL parser reads it: tabs and line breaks
 * anywhere are dropped, and controls and spaces at either end (`java\tscript:`,
 * ` javascript:`). Nothing else is removed, so a check can't approve a URL the
 * browser would read differently.
 */
function asParsed(url: string): string {
  const u = url.replace(/[\t\n\r]/g, "");
  const isEdge = (i: number) => u.charCodeAt(i) <= 0x20;
  let start = 0;
  let end = u.length;
  while (start < end && isEdge(start)) start += 1;
  while (end > start && isEdge(end - 1)) end -= 1;
  return u.slice(start, end);
}

/** Image types an `<img>` or a CSS image may carry inline. */
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,]/i;

/**
 * A link target: a place in the document, a web page, or an email address. Kept
 * on paper (a PDF keeps links); nothing in the print copy can be clicked
 * (the sheet is `inert`). Relative paths go: they'd resolve against trace's own
 * origin, and an agent's document has no files of its own to point at.
 */
export function isSafeLink(url: string): boolean {
  const u = asParsed(url);
  return /^#/.test(u) || /^(?:https?|mailto):/i.test(u);
}

/**
 * Something the page fetches to draw (an `<img src>`): a web image, as the
 * sandboxed frame fetches today, or an inline image. Never trace's own schemes
 * (`trace-img:`, `asset:`, `ipc:`), `blob:`, `javascript:` or `data:text/html`.
 */
export function isSafeResource(url: string): boolean {
  const u = asParsed(url);
  return /^https?:/i.test(u) || DATA_IMAGE.test(u);
}

/**
 * A `url()` in the document's CSS: a reference inside the document (an SVG
 * gradient, `url(#g)`) or an inline image. Remote ones go — fonts, backgrounds
 * and `@import` would otherwise be fetched from trace's page — which costs a
 * document only web fonts and remote backgrounds.
 */
export function isSafeCssUrl(url: string): boolean {
  const u = url.trim();
  return /^#./.test(u) || DATA_IMAGE.test(u);
}

/** CSS text with its escapes resolved (`u\72l(` is `url(`), so a scan can't be dodged. */
export function cssUnescape(text: string): string {
  return text.replace(/\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|([^\n\r\f]))/g, (_m, hex, ch) => {
    if (typeof ch === "string") return ch;
    const code = Number.parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : String.fromCodePoint(0xfffd);
  });
}

/** CSS functions that load something from a URL written as a plain string. */
const STRING_FETCHERS = /(?:image-set|image|cross-fade|element)\(/i;

const URL_TOKEN = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)\s]*))\s*\)/gi;
const QUOTED = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;

/**
 * Whether a CSS value (a declaration's, or an SVG presentation attribute's)
 * fetches nothing but what `isSafeCssUrl` allows. `src()` goes outright: it
 * takes `var()`, so its URL can't be read from the value.
 */
export function isSafeCssValue(value: string): boolean {
  const text = cssUnescape(value);
  if (/\bsrc\(/i.test(text)) return false;
  for (const m of text.matchAll(URL_TOKEN)) {
    if (!isSafeCssUrl(m[1] ?? m[2] ?? m[3] ?? "")) return false;
  }
  if (STRING_FETCHERS.test(text)) {
    for (const m of text.matchAll(QUOTED)) {
      if (!isSafeCssUrl(m[1] ?? m[2] ?? "")) return false;
    }
  }
  return true;
}

/** Elements whose `src`/`href` is an image to draw, not a link to follow. */
const IMAGE_TAGS = new Set(["img", "image", "feimage", "input"]);

/** Attributes that only ever name a URL to load or submit to: never kept. */
const LOADING_ATTRS = new Set([
  "action",
  "formaction",
  "background",
  "poster",
  "srcset",
  "data",
  "codebase",
  "longdesc",
  "ping",
  "manifest",
  "lowsrc",
  "dynsrc",
]);

/**
 * Whether the sanitiser keeps attribute `attr` (lowercase) with `value` on a
 * `tag` (lowercase) element. Only attributes that hold a URL, or CSS that may,
 * are judged; anything else is left to DOMPurify's own allow-list. `style` is
 * filtered declaration by declaration after sanitising (`sanitizeHtml.ts`).
 */
export function keepsUrlAttribute(tag: string, attr: string, value: string): boolean {
  if (LOADING_ATTRS.has(attr)) return false;
  if (attr === "src") return isSafeResource(value);
  if (attr === "href" || attr === "xlink:href") {
    return IMAGE_TAGS.has(tag) ? isSafeResource(value) : isSafeLink(value);
  }
  if (attr === "cite") return isSafeLink(value);
  if (attr !== "style" && /url\(|image-set\(|src\(/i.test(cssUnescape(value))) {
    return isSafeCssValue(value);
  }
  return true;
}
