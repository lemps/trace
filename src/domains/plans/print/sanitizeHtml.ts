import createDOMPurify from "dompurify";
import { filterDeclarations } from "./docSheets";
import { PURIFY_CONFIG } from "./sanitizeConfig";
import { keepsUrlAttribute } from "./urlPolicy";

// An agent's HTML document, made safe to render inside trace's own page for its
// print copy. DOMPurify parses it into an inert document (nothing loads or runs
// there) and sanitises it against `PURIFY_CONFIG`, with URL attributes judged by
// `urlPolicy.ts`. Then it's taken apart for `renderDocument.ts`: the <style>
// text (cleaned again through the CSSOM, `docSheets.ts`), and <html>/<body>,
// whose content and attributes move onto the shadow root's wrappers.

/** A sanitised document, still in DOMPurify's inert document. */
export interface CleanDocument {
  /** Every <style>'s text, in document order (<head>'s, <body>'s and SVG's). */
  styles: string[];
  /** The sanitised <html>: its attributes go on the page wrapper. */
  html: Element;
  /** The sanitised <body>: its attributes and content go on the body wrapper. */
  body: Element | null;
}

/**
 * A fresh DOMPurify for each document: its hook is its own, never added to the
 * shared instance mermaid sanitises its diagrams with.
 */
function purifier() {
  const purify = createDOMPurify(window);
  if (!purify.isSupported) throw new Error("The sanitiser isn't supported here.");
  purify.addHook("uponSanitizeAttribute", (node, data) => {
    if (!keepsUrlAttribute(node.nodeName.toLowerCase(), data.attrName, data.attrValue)) {
      data.keepAttr = false;
    }
  });
  return purify;
}

/**
 * An element's `style` attribute with any fetching declaration removed (the
 * same rule as the stylesheets'). An element whose inline style can't be read
 * as CSS loses the attribute.
 */
function cleanInlineStyle(el: Element): void {
  if ("style" in el && el.style instanceof CSSStyleDeclaration) {
    filterDeclarations(el.style);
    if (el.style.length > 0) return;
  }
  el.removeAttribute("style");
}

/** `html`, sanitised and taken apart. Throws if it can't be (the caller falls back). */
export function sanitizeDocument(html: string): CleanDocument {
  const root = purifier().sanitize(html, PURIFY_CONFIG);
  if (!(root instanceof Element)) throw new Error("The sanitiser returned no document.");
  const styles: string[] = [];
  for (const style of Array.from(root.querySelectorAll("style"))) {
    styles.push(style.textContent ?? "");
    style.remove();
  }
  for (const el of Array.from(root.querySelectorAll("[style]"))) cleanInlineStyle(el);
  if (root.hasAttribute("style")) cleanInlineStyle(root);
  // Paper can't be clicked open: a collapsed section prints expanded.
  for (const details of Array.from(root.querySelectorAll("details"))) {
    details.setAttribute("open", "");
  }
  // A web image is fetched from trace's page now, not an opaque frame: it
  // doesn't learn where from.
  for (const img of Array.from(root.querySelectorAll("img"))) {
    img.setAttribute("referrerpolicy", "no-referrer");
  }
  return { styles, html: root, body: root.querySelector("body") };
}
