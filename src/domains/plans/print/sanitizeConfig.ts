import type { Config } from "dompurify";

// How an agent's HTML is sanitised before its print copy goes into trace's own
// page. DOMPurify's allow-lists do most of it (no <script>, no on* handlers, no
// <iframe>/<object>/<embed>/<base>/<meta>/<link>, SVG and MathML in its safe
// profiles: no <foreignObject>, <use>, <animate> or <set>). This names the
// rest out loud, so a later DOMPurify default can't quietly widen it. URL
// attributes go through `urlPolicy.ts` in a hook (`sanitizeHtml.ts`).

/** Elements that never reach the print copy, even if a future default allowed them. */
export const FORBIDDEN_TAGS = [
  // Run or embed something: script, other documents, plugins.
  "script",
  "noscript",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "portal",
  "fencedframe",
  // Change how the page resolves or behaves: base URL, refresh, stylesheets, preloads.
  "base",
  "meta",
  "link",
  // Submit somewhere. A form's fields stay (DOMPurify keeps the content).
  "form",
  // Media means nothing on paper; their fallback text stays.
  "video",
  "audio",
  "source",
  "track",
  // Custom-element plumbing.
  "template",
  "slot",
  // SVG elements that pull in other content or run timelines.
  "foreignobject",
  "use",
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
  "discard",
] as const;

/** Attributes that never reach the print copy. (`on*` handlers aren't in DOMPurify's allow-list at all.) */
export const FORBIDDEN_ATTRS = [
  // Submit or fetch on someone's behalf.
  "action",
  "formaction",
  "formmethod",
  "formtarget",
  "method",
  "enctype",
  "ping",
  "srcset",
  "sizes",
  "background",
  "poster",
  // Act when clicked, focused or loaded: popovers, invoker commands, focus.
  "popover",
  "popovertarget",
  "popovertargetaction",
  "command",
  "commandfor",
  "autofocus",
  "tabindex",
  "contenteditable",
  "target",
  "download",
  // A lazy image never loads in a sheet that's laid out off screen.
  "loading",
  // Only meaningful with script or a CSP.
  "nonce",
  "integrity",
  "crossorigin",
  "is",
  // Declarative shadow roots.
  "shadowroot",
  "shadowrootmode",
] as const;

/**
 * The DOMPurify call. `WHOLE_DOCUMENT` keeps <head>'s <style> elements and
 * <html>/<body>'s attributes, which a fragment parse would drop; `RETURN_DOM`
 * returns that sanitised <html> element, still in DOMPurify's inert document
 * (nothing in it has loaded or run), for `sanitizeHtml.ts` to take apart.
 */
export const PURIFY_CONFIG = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  FORBID_TAGS: [...FORBIDDEN_TAGS],
  FORBID_ATTR: [...FORBIDDEN_ATTRS],
  // data-* stays: documents style by it ([data-status="done"]).
  ALLOW_DATA_ATTR: true,
  ALLOW_ARIA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // Strips markup hidden in comments and in <style> text (`</style><img onerror>`).
  SAFE_FOR_XML: true,
  // Ids and names can't shadow DOM properties.
  SANITIZE_DOM: true,
  // A removed element's text stays (a <form>'s fields, a <video>'s fallback).
  KEEP_CONTENT: true,
  WHOLE_DOCUMENT: true,
  RETURN_DOM: true,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false,
  IN_PLACE: false,
} satisfies Config;
