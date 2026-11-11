import { baseSheet, documentSheet } from "./docSheets";
import { BODY_CLASS, HTML_CLASS } from "./rootSelectors";
import { sanitizeDocument } from "./sanitizeHtml";

// An agent's HTML document as part of trace's own page, for printing: the
// sanitised content in a shadow root on `host`. The shadow root is the wall
// both ways. The document's CSS can't reach trace (its sheets apply only inside,
// and rules that would style the host are dropped), and trace's CSS can't reach
// the document (the page wrapper starts from `all: initial`). Being in the page,
// rather than in a frame, is what lets the print engine break it across pages.

/** A wrapper standing in for <html> or <body>: that element's attributes, plus `cls`. */
function wrapper(cls: string, from: Element | null): HTMLDivElement {
  const div = document.createElement("div");
  for (const attr of Array.from(from?.attributes ?? [])) {
    if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) continue;
    div.setAttribute(attr.name, attr.value);
  }
  div.classList.add(cls);
  return div;
}

/** A document rendered for print: its shadow root and the two wrappers. */
export interface Rendered {
  root: ShadowRoot;
  /** Stands in for <html>. */
  page: HTMLElement;
  /** Stands in for <body>; the document's content is in it. */
  body: HTMLElement;
}

/**
 * Sanitise `html` and render it into `host`'s shadow root, replacing whatever
 * was there. Throws if the document can't be sanitised or its CSS can't be
 * built, before anything has been rendered.
 */
export function renderDocument(host: HTMLElement, html: string): Rendered {
  // Without constructable sheets the copy would print unstyled: use the frame.
  if (!("adoptedStyleSheets" in ShadowRoot.prototype)) {
    throw new Error("This webview can't style a shadow root.");
  }
  const clean = sanitizeDocument(html);
  const sheets = [baseSheet(), ...clean.styles.map(documentSheet)];
  const page = wrapper(HTML_CLASS, clean.html);
  const body = wrapper(BODY_CLASS, clean.body);
  // Moving the nodes adopts them into trace's document; images start loading.
  if (clean.body) body.append(...Array.from(clean.body.childNodes));
  page.append(body);
  // Open, so a re-render (React's strict mode runs effects twice) reuses it.
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  // Styles before content, so nothing is ever drawn unstyled.
  root.adoptedStyleSheets = sheets;
  root.replaceChildren(page);
  return { root, page, body };
}

/** Empty `root` again (the sheet is unmounting or re-rendering). */
export function clearDocument(root: ShadowRoot): void {
  root.replaceChildren();
  root.adoptedStyleSheets = [];
}
