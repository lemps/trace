import { type RefObject, useLayoutEffect, useRef, useState } from "react";

// Fits a row of tabs into its width by measuring, never by counting: every tab
// keeps its label while they all fit; then only the active one does and the rest
// are icons (named by their tooltip and aria-label); then the active one is an
// icon too; then tabs from the end (never the first) go to a "more" menu. A label is never cut to
// a couple of letters.
//
// Markup: the tabs sit in a `.tab-fit` row (`fitRef`), each with `data-fit-tab`
// = its id and its label in a `data-fit-label` element; something that belongs
// to a tab (its close button, the rule before it) has `data-fit-of` = that id;
// the row's other children are fixed. The "more" trigger (`moreRef`) sits after
// the row, outside it, and is only rendered while a tab is out. Classes come from
// `fitClass`. Every tab stays mounted (an out one is hidden and out of flow), so
// each can be measured whatever is shown.

export type TabFitMode = "label" | "icon" | "out";

interface Fit {
  icons: boolean;
  activeLabel: boolean;
  out: readonly string[];
}

const ALL: Fit = { icons: false, activeLabel: true, out: [] };
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
  const [fit, setFit] = useState<Fit>(ALL);
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
    if (!same(fit, next)) setFit(next);
  });

  return {
    out: fit.out,
    mode: (id) => {
      if (fit.out.includes(id)) return "out";
      if (!fit.icons || (fit.activeLabel && id === active)) return "label";
      return "icon";
    },
  };
}

/** The class a tab, or something that belongs to one, takes for its mode. */
export function fitClass(mode: TabFitMode): string {
  return mode === "label" ? "" : mode === "icon" ? " fit-icon" : " fit-out";
}

/** Spare room (px) needed to step back to a roomier fit. */
const SLACK = 4;
const rank = (f: Fit) => (f.out.length > 0 ? 3 : !f.icons ? 0 : f.activeLabel ? 1 : 2);

const same = (a: Fit, b: Fit) =>
  a.icons === b.icons && a.activeLabel === b.activeLabel && a.out.join("\n") === b.out.join("\n");

type Item = { tab: string; full: number; icon: number } | { of: string | null; w: number };

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

  const items: Item[] = [];
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
    const label = child.querySelector<HTMLElement>("[data-fit-label]");
    const labelW = label?.scrollWidth ?? 0;
    const inner = label ? px(s.columnGap) : 0;
    const max = px(s.maxWidth) || Number.POSITIVE_INFINITY;
    if (child.classList.contains("fit-icon") || child.classList.contains("fit-out")) {
      items.push({ tab, icon: w, full: Math.min(w + inner + labelW, max + margins) });
    } else {
      items.push({ tab, full: w, icon: w - (label?.offsetWidth ?? 0) - inner });
    }
  }

  const need = (labeled: (tab: string) => boolean, out: ReadonlySet<string>) => {
    let sum = 0;
    let n = 0;
    for (const item of items) {
      if ("tab" in item) {
        if (out.has(item.tab)) continue;
        sum += labeled(item.tab) ? item.full : item.icon;
      } else {
        if (item.of !== null && out.has(item.of)) continue;
        sum += item.w;
      }
      n++;
    }
    return sum + gap * Math.max(0, n - 1);
  };

  // Going back to a roomier step takes a little spare room, so a width that
  // rounds either way can't flip between two steps.
  const step = rank(was);
  const fits = (width: number, at: number) => width <= avail - (at < step ? SLACK : 0);
  const none = new Set<string>();
  if (
    fits(
      need(() => true, none),
      0
    )
  )
    return ALL;
  if (
    fits(
      need((t) => t === active, none),
      1
    )
  )
    return { icons: true, activeLabel: true, out: [] };
  if (
    fits(
      need(() => false, none),
      2
    )
  )
    return { icons: true, activeLabel: false, out: [] };
  const out = new Set<string>();
  // The first tab (Main, the agent's chat) and the active one always stay.
  const tabs = items
    .flatMap((i) => ("tab" in i ? [i.tab] : []))
    .filter((t, i) => i > 0 && t !== active);
  const room = avail - moreW.current - (was.out.length > 0 ? SLACK : 0);
  for (let i = tabs.length - 1; i >= 0; i--) {
    out.add(tabs[i]);
    if (need(() => false, out) <= room) break;
  }
  return { icons: true, activeLabel: false, out: tabs.filter((t) => out.has(t)) };
}
