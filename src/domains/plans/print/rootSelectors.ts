// A document's `html`, `body` and `:root` rules, moved onto the two wrappers that
// stand in for those elements in the print copy's shadow root (where there is no
// <html> or <body> to match). Selector text in, selector text out: pure, so it's
// tested on strings; `docSheets.ts` applies it to every rule through the CSSOM.

/** What each root selector becomes. */
export interface RootTargets {
  /** For the type selector `html`. */
  html: string;
  /** For the type selector `body`. */
  body: string;
  /** For the pseudo-class `:root`. */
  root: string;
}

/** The print copy's wrappers. `div:where(.x)` keeps a type selector's specificity (0,0,1). */
export const HTML_CLASS = "trace-print-html";
export const BODY_CLASS = "trace-print-body";
export const ROOT_TARGETS: RootTargets = {
  html: `div:where(.${HTML_CLASS})`,
  body: `div:where(.${BODY_CLASS})`,
  // `:root` is a pseudo-class (0,1,0), as specific as a class.
  root: `.${HTML_CLASS}`,
};

/** Pseudo-classes whose argument is itself a selector, so `body` inside it maps too. */
const SELECTOR_ARGS = new Set([
  "is",
  "where",
  "not",
  "has",
  "matches",
  "any",
  "-webkit-any",
  "nth-child",
  "nth-last-child",
]);

const isIdentChar = (c: string | undefined) =>
  c !== undefined && (/[A-Za-z0-9_-]/.test(c) || c.charCodeAt(0) >= 0x80);

function isIdentStart(s: string, i: number): boolean {
  const c = s[i];
  if (c === undefined) return false;
  if (c === "\\") return true;
  if (c === "-") return isIdentChar(s[i + 1]) && !/[0-9]/.test(s[i + 1] ?? "");
  return /[A-Za-z_]/.test(c) || c.charCodeAt(0) >= 0x80;
}

/** The identifier at `i` (escapes included), as written. */
function readIdent(s: string, i: number): string {
  let j = i;
  while (j < s.length) {
    if (s[j] === "\\") j += 2;
    else if (isIdentChar(s[j])) j += 1;
    else break;
  }
  return s.slice(i, j);
}

/** Where the string or `[attribute]` that opens at `i` ends (exclusive). */
function skipQuoted(s: string, i: number, close: string): number {
  let j = i + 1;
  while (j < s.length && s[j] !== close) {
    if (s[j] === "\\") j += 1;
    else if (close === "]" && (s[j] === '"' || s[j] === "'")) j = skipQuoted(s, j, s[j]) - 1;
    j += 1;
  }
  return Math.min(j + 1, s.length);
}

/** A combinator, a list comma, `(` or the start: what may come right before a type selector. */
const BEFORE_TYPE = /^$|[\s>+~,(]/;

/**
 * `selector` (a selector list, as the CSSOM serialises it) with every `html` and
 * `body` type selector and every `:root` replaced by `targets`. Classes, ids,
 * attribute values, strings, longer names (`tbody`, `body-text`) and the
 * arguments of non-selector functions (`:lang(…)`, `::part(…)`) are left alone.
 */
export function mapRootSelectors(selector: string, targets: RootTargets = ROOT_TARGETS): string {
  let out = "";
  let prev = "";
  let fn = "";
  // Each open parenthesis: whether its content is a selector.
  const parens: boolean[] = [];
  const inSelector = () => parens.every(Boolean);
  let i = 0;
  while (i < selector.length) {
    const c = selector[i];
    if (c === '"' || c === "'" || c === "[") {
      const end = skipQuoted(selector, i, c === "[" ? "]" : c);
      out += selector.slice(i, end);
      prev = selector[end - 1] ?? "";
      i = end;
      fn = "";
      continue;
    }
    if (c === ":") {
      let j = i;
      while (selector[j] === ":") j += 1;
      const name = readIdent(selector, j);
      const end = j + name.length;
      const lower = name.toLowerCase();
      if (inSelector() && j - i === 1 && lower === "root" && selector[end] !== "(") {
        out += targets.root;
      } else {
        out += selector.slice(i, end);
      }
      fn = j - i === 1 ? lower : "";
      prev = "a";
      i = end;
      continue;
    }
    if (c === "(") parens.push(SELECTOR_ARGS.has(fn) && inSelector());
    if (c === ")") parens.pop();
    if (isIdentStart(selector, i)) {
      const name = readIdent(selector, i);
      const end = i + name.length;
      const lower = name.toLowerCase();
      const isType = BEFORE_TYPE.test(prev) && selector[end] !== "(" && selector[end] !== "|";
      if (inSelector() && isType && (lower === "html" || lower === "body")) {
        out += lower === "html" ? targets.html : targets.body;
      } else {
        out += name;
      }
      prev = "a";
      fn = "";
      i = end;
      continue;
    }
    out += c;
    prev = c;
    fn = c === "(" ? fn : "";
    i += 1;
  }
  return out;
}

/**
 * Rules that would style the shadow host, which lives in trace's own page
 * (`:host`, `:host-context`), or reach across shadow boundaries (`::slotted`,
 * `::part`). The print copy drops them whole.
 */
export function reachesOutside(selector: string): boolean {
  return /:host\b|:host-context|::slotted|::part/i.test(selector);
}
