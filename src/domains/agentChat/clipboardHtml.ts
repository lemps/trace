import { TABLE_CELL_STYLE, TABLE_STYLE } from "@/components/markdown/tableExport";

// A chat message (or part of one) as HTML for the clipboard: the markup the
// Markdown rendered — headings, paragraphs, lists, emphasis, links, code,
// tables — so a paste into a doc, mail or Slack keeps its formatting. Trace's
// own controls (copy buttons, the hover bar, Show more, menus, thumbnails) are
// dropped, and so are classes and theme colours, which mean nothing elsewhere.

/** Drawn inside a message but not part of what it says. */
const CONTROLS = [
  ".ac-msg-actions",
  ".md-table-copy",
  ".md-code-head",
  ".md-insight-label",
  ".tx-bubble-more",
  ".ac-sent-files",
  ".pop-menu-pop",
  "svg",
  "img",
].join(", ");

/** The only attributes that mean something outside trace. */
const KEEP_ATTRS = new Set(["href", "start", "colspan", "rowspan"]);

/** `el` as a `tag` element, keeping its children. */
function retag(el: Element, tag: string): Element {
  const next = el.ownerDocument.createElement(tag);
  next.append(...el.childNodes);
  el.replaceWith(next);
  return next;
}

/** Clean `root` in place (see the top of the file). */
function clean(root: Element): void {
  for (const el of root.querySelectorAll(CONTROLS)) el.remove();
  // A file link is a button that opens a menu; elsewhere it's just the path.
  for (const el of root.querySelectorAll(".tx-file-link")) {
    const code = el.ownerDocument.createElement("code");
    code.textContent = el.textContent;
    el.replaceWith(code);
  }
  for (const el of root.querySelectorAll("button")) el.remove();
  // A GFM task item's box, as the text that says the same.
  for (const el of root.querySelectorAll("input[type=checkbox]")) {
    const box = el as HTMLInputElement;
    el.replaceWith(box.checked ? "☑ " : "☐ ");
  }
  // The chat draws paragraphs as divs (a file link's menu can't sit in a <p>).
  for (const el of root.querySelectorAll(".ac-p")) retag(el, "p");
  for (const el of root.querySelectorAll(".md-insight")) retag(el, "blockquote");
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const align = (el as HTMLElement).style?.textAlign;
    for (const { name, value } of [...el.attributes]) {
      // Only web and mail links travel: anything else is trace's, or unsafe elsewhere.
      const unsafe = name === "href" && !/^(https?:|mailto:)/i.test(value);
      if (!KEEP_ATTRS.has(name) || unsafe) el.removeAttribute(name);
    }
    const tag = el.tagName.toLowerCase();
    if (tag === "table") el.setAttribute("style", TABLE_STYLE);
    if (tag === "th" || tag === "td") {
      el.setAttribute("style", `${TABLE_CELL_STYLE}${align ? `;text-align:${align}` : ""}`);
    }
  }
}

/** The HTML of a rendered message (its row element), for the clipboard. */
export function messageHtml(row: Element): string {
  const copy = row.cloneNode(true) as Element;
  clean(copy);
  return copy.innerHTML.trim();
}

/** The HTML of `range` (a selection inside a message), for the clipboard. */
export function rangeHtml(range: Range): string {
  const holder = document.createElement("div");
  holder.append(range.cloneContents());
  clean(holder);
  return holder.innerHTML.trim();
}
