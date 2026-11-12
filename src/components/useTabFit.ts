import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { ALL_LABELS, type Fit, type FitItem, nextFit, sameFit } from "./tabFitSolve";

// Fits a row of tabs into its width by measuring, never by counting. Tabs keep
// their labels while they all fit; then they become icons (named by their tooltip
// and aria-label) one at a time, only as many as it takes: the early ones first
// (`data-fit-early`, a detail's subagent tabs), then the rest from the end, the
// active one last. Past that, tabs go to a "more" menu in the same order (never the
// first, never the active one). `tabFitSolve` decides; this measures. A label is
// never cut to a couple of letters.
//
// Markup: the tabs sit in a `.tab-fit` row (`fitRef`), each with `data-fit-tab`
// = its id and its label in a `data-fit-label` element; something that belongs
// to a tab (its close button, the rule before it) has `data-fit-of` = that id;
// the row's other children are fixed. The "more" trigger (`moreRef`) sits after
// the row, outside it, and is only rendered while a tab is out. Classes come from
// `fitClass`. Every tab stays mounted (an out one is hidden and out of flow), so
// each can be measured whatever is shown.

export type TabFitMode = "label" | "icon" | "out";

/** The "more" trigger's width before it has been drawn once. */
const MORE_GUESS = 72;

export interface TabFit {
  mode: (id: string) => TabFitMode;
  /** The tabs in the "more" menu, in strip order. */
  out: readonly string[];
}

export function useTabFit(
  fitRef: RefObject<HTMLElement | null>,
  moreRef: RefObject<HTMLElement | null>,
  active: string
): TabFit {
  const [fit, setFit] = useState<Fit>(ALL_LABELS);
  const [, setSize] = useState(0);
  const moreW = useRef(MORE_GUESS);

  useLayoutEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitRef]);

  // Re-measured after every render: labels, badges and tabs change without a resize.
  useLayoutEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const next = measure(el, moreRef.current, active, moreW, fit);
    if (!sameFit(fit, next)) setFit(next);
  });

  return {
    out: fit.out,
    mode: (id) => (fit.out.includes(id) ? "out" : fit.icons.includes(id) ? "icon" : "label"),
  };
}

/** The class a tab, or something that belongs to one, takes for its mode. */
export function fitClass(mode: TabFitMode): string {
  // An out tab is measured as an icon too, so it can come back as one.
  return mode === "label" ? "" : mode === "icon" ? " fit-icon" : " fit-icon fit-out";
}

/** Spare room (px) needed to step back to a roomier fit. */
const SLACK = 4;

const px = (v: string) => Number.parseFloat(v) || 0;

function measure(
  el: HTMLElement,
  more: HTMLElement | null,
  active: string,
  moreW: { current: number },
  was: Fit
): Fit {
  const cs = getComputedStyle(el);
  const gap = px(cs.columnGap);
  const outerGap = el.parentElement ? px(getComputedStyle(el.parentElement).columnGap) : 0;
  if (more) moreW.current = more.offsetWidth + outerGap;
  // The room the tabs would have with no "more" trigger beside them.
  const avail =
    el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight) + (more ? moreW.current : 0) + 0.5;

  const items: FitItem[] = [];
  for (const child of el.children) {
    if (!(child instanceof HTMLElement)) continue;
    const s = getComputedStyle(child);
    const margins = px(s.marginLeft) + px(s.marginRight);
    const w = child.offsetWidth + margins;
    const tab = child.dataset.fitTab;
    if (tab === undefined) {
      items.push({ of: child.dataset.fitOf ?? null, w });
      continue;
    }
    const early = child.dataset.fitEarly !== undefined;
    const label = child.querySelector<HTMLElement>("[data-fit-label]");
    // A capped label (a subagent's task) is never wider than its cap, whatever it holds.
    const cap = label ? px(getComputedStyle(label).maxWidth) : 0;
    const labelW = Math.min(label?.scrollWidth ?? 0, cap || Number.POSITIVE_INFINITY);
    const inner = label ? px(s.columnGap) : 0;
    const max = px(s.maxWidth) || Number.POSITIVE_INFINITY;
    if (child.classList.contains("fit-icon")) {
      items.push({ tab, early, icon: w, full: Math.min(w + inner + labelW, max + margins) });
    } else {
      items.push({ tab, early, full: w, icon: w - (label?.offsetWidth ?? 0) - inner });
    }
  }
  return nextFit(items, active, { avail, more: moreW.current, gap }, was, SLACK);
}
