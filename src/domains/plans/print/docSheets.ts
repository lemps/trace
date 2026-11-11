import { BODY_CLASS, HTML_CLASS, mapRootSelectors, reachesOutside } from "./rootSelectors";
import { isSafeCssValue } from "./urlPolicy";

// The print copy's stylesheets, built through the CSSOM rather than by editing
// CSS text: the browser parses each <style> of the document once, and every rule
// it understood is then visited (inside @media, @supports, @layer, @container
// and nested rules too). What they carry into the shadow root:
//   - `html`/`body`/`:root` rules land on the wrappers (rootSelectors.ts);
//   - nothing is fetched: @import is dropped (`replaceSync` ignores it anyway)
//     and so is any declaration whose url() isn't in-document or inline;
//   - nothing reaches out: `:host`/`::slotted`/`::part` rules, `@property`
//     (registered for the whole page, trace's own tokens included) and `@page`
//     (trace sets the paper) go.
// `@media print` rules stay, and apply when the page is printed.

/** Remove every declaration that would fetch something `isSafeCssValue` doesn't allow. */
export function filterDeclarations(style: CSSStyleDeclaration): void {
  const names = Array.from({ length: style.length }, (_, i) => style.item(i));
  for (const name of names) {
    if (!isSafeCssValue(style.getPropertyValue(name))) style.removeProperty(name);
  }
}

/** A rule list that rules can be deleted from. */
interface RuleParent {
  readonly cssRules: CSSRuleList;
  deleteRule(index: number): void;
}

const isPropertyRule = (rule: CSSRule) =>
  typeof CSSPropertyRule !== "undefined" && rule instanceof CSSPropertyRule;

/** Clean one rule in place; false when it must go altogether. */
function keepRule(rule: CSSRule): boolean {
  if (rule instanceof CSSImportRule || rule instanceof CSSPageRule || isPropertyRule(rule)) {
    return false;
  }
  if (rule instanceof CSSStyleRule) {
    if (reachesOutside(rule.selectorText)) return false;
    const mapped = mapRootSelectors(rule.selectorText);
    // A selector the engine won't take keeps its old text, which can't match.
    if (mapped !== rule.selectorText) rule.selectorText = mapped;
  }
  // Style rules, @font-face, keyframes, nested declarations.
  if ("style" in rule && rule.style instanceof CSSStyleDeclaration) filterDeclarations(rule.style);
  if (rule instanceof CSSKeyframesRule) {
    for (const frame of Array.from(rule.cssRules)) keepRule(frame);
  } else if (rule instanceof CSSGroupingRule && rule.cssRules) {
    // @media, @supports, @layer, @container, @scope and nested style rules.
    cleanRules(rule);
  }
  return true;
}

function cleanRules(parent: RuleParent): void {
  for (let i = parent.cssRules.length - 1; i >= 0; i -= 1) {
    const rule = parent.cssRules[i];
    if (rule && !keepRule(rule)) parent.deleteRule(i);
  }
}

/** One of the document's <style> elements, cleaned, as a sheet for the shadow root. */
export function documentSheet(text: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  cleanRules(sheet);
  return sheet;
}

/**
 * What the print copy starts from, before the document's own CSS (so it wins
 * over all of this; every selector here is `:where()`, specificity 0).
 *
 * - The page wrapper starts from `all: initial`, as a fresh document does in
 *   its frame: none of trace's type, colour or spacing reaches the document.
 *   It stays as hidden as the sheet is on screen, and is paper: light, a
 *   white page, dark text, unless the document says otherwise. Backgrounds
 *   print (a card's tint, a dark code block) as they're drawn on screen.
 * - Pagination: images, figures, code, quotes and table rows aren't split;
 *   headings stay with what follows; a table's head repeats on each page.
 * - Paper doesn't scroll: images fit the column; code and table cells wrap
 *   (a table that fits is laid out as before; one that doesn't wraps its
 *   cells rather than running off the page).
 */
const BASE_CSS = `
:where(.${HTML_CLASS}) {
  all: initial;
  display: block;
  visibility: inherit;
  color-scheme: light;
  background: Canvas;
  color: CanvasText;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
:where(.${BODY_CLASS}) {
  display: block;
}
:where(img, svg, figure, tr, pre, blockquote) {
  break-inside: avoid;
}
:where(h1, h2, h3, h4, h5, h6) {
  break-after: avoid;
}
:where(thead) {
  display: table-header-group;
}
:where(img) {
  max-width: 100%;
  height: auto;
}
:where(pre) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
:where(td, th) {
  overflow-wrap: anywhere;
}
`;

/** The defaults sheet (above), first in the shadow root's sheets. */
export function baseSheet(): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(BASE_CSS);
  return sheet;
}
