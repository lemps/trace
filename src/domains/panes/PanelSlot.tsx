import { useLayoutEffect, useRef } from "react";

// Where a pane shows its tab. The tab's content isn't rendered here: the pane area
// keeps one element per shown tab and portals the content into it, and this slot
// only adopts that element. So when a tab moves to another pane, its element moves
// and nothing under it remounts — a terminal keeps its PTY and screen, a chat its
// composer draft, Files its selection.
//
// Taking an element out of the document loses its scroll offsets, so they're noted
// on the way out and put back on the way in.

const scrolls = new WeakMap<HTMLElement, [Element, number, number][]>();

function noteScroll(el: HTMLElement): void {
  const scrolled: [Element, number, number][] = [];
  for (const node of [el, ...el.querySelectorAll("*")]) {
    if (node.scrollTop !== 0 || node.scrollLeft !== 0) {
      scrolled.push([node, node.scrollTop, node.scrollLeft]);
    }
  }
  scrolls.set(el, scrolled);
}

function restoreScroll(el: HTMLElement): void {
  for (const [node, top, left] of scrolls.get(el) ?? []) {
    if (!el.contains(node)) continue;
    node.scrollTop = top;
    node.scrollLeft = left;
  }
  scrolls.delete(el);
}

export function PanelSlot({ el }: { el: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  // A layout effect, so the element is in the document before its content's own
  // effects run (xterm can only open, and fit, once it's laid out).
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.appendChild(el);
    restoreScroll(el);
    return () => {
      noteScroll(el);
      if (el.parentNode === host) host.removeChild(el);
    };
  }, [el]);
  return <div className="pn-slot" ref={ref} />;
}

/**
 * Put keyboard focus in a pane, where typing would go if you clicked it: a transcript
 * laid over a terminal (never the terminal under it, which would type blind), a start
 * prompt's button, the terminal, the message box, its scroller — or the pane itself.
 */
export function focusPane(groupEl: Element | null): void {
  const slot = groupEl?.querySelector(".pn-slot");
  if (!slot) return;
  const target =
    slot.querySelector<HTMLElement>(".tx-cover .tx-scroll") ??
    slot.querySelector<HTMLElement>(".tx-cover") ??
    slot.querySelector<HTMLElement>(".empty-state button") ??
    slot.querySelector<HTMLElement>(".xterm-helper-textarea") ??
    slot.querySelector<HTMLElement>("textarea:not(:disabled), input:not(:disabled)") ??
    slot.querySelector<HTMLElement>("[tabindex='-1'], [tabindex='0']") ??
    (groupEl instanceof HTMLElement ? groupEl : null);
  target?.focus({ preventScroll: true });
}
