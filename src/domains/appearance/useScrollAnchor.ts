import { type MouseEvent, useCallback, useEffect, useRef } from "react";
import { anchoredScrollTop, targetTop } from "./anchor";
import { useAppearance } from "./store";

// Settings → Appearance: after a click on a control, put that control back
// where it was on screen if the option moved the page — above all Interface
// size, which zooms everything once the webview's async zoom lands. Only the
// scroll container's scrollTop changes. The maths is in anchor.ts.

interface Pending {
  el: Element;
  top: number;
  scale: number;
}

/** Give up on a zoom that never lands (the native call failed). */
const ZOOM_TIMEOUT_MS = 2000;
/** Layout can trail the zoom landing by a frame or two; correct once more after it. */
const SETTLE_MS = 150;

function scrollParent(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === "auto" || overflowY === "scroll") return p;
  }
  return null;
}

function correct({ el, top, scale }: Pending, nowScale: number): void {
  if (!el.isConnected) return;
  const scroller = scrollParent(el);
  if (!scroller) return;
  const next = anchoredScrollTop({
    scrollTop: scroller.scrollTop,
    top: el.getBoundingClientRect().top,
    target: targetTop(top, scale, nowScale),
    maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
  });
  if (Math.abs(next - scroller.scrollTop) >= 1)
    scroller.scrollTo({ top: next, behavior: "instant" });
}

/**
 * An `onClickCapture` handler for the page: it records the clicked control's
 * position before the click's own handler changes anything, then corrects the
 * scroll once the change is on screen (after the zoom lands, for a zoom).
 */
export function useScrollAnchor(): (e: MouseEvent) => void {
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);

  return useCallback((e: MouseEvent) => {
    const el = (e.target as Element).closest("button, input, label, [role='switch']");
    if (!el) return;
    cleanup.current();
    const pending: Pending = {
      el,
      top: el.getBoundingClientRect().top,
      scale: useAppearance.getState().appliedScale,
    };
    const frames: number[] = [];
    const timers: number[] = [];
    let unsub = () => {};
    const settle = () => {
      const nowScale = useAppearance.getState().appliedScale;
      frames.push(requestAnimationFrame(() => correct(pending, nowScale)));
      timers.push(window.setTimeout(() => correct(pending, nowScale), SETTLE_MS));
    };
    cleanup.current = () => {
      unsub();
      for (const f of frames) cancelAnimationFrame(f);
      for (const t of timers) clearTimeout(t);
    };
    // The click's handlers run after this capture: look once they have.
    frames.push(
      requestAnimationFrame(() => {
        const s = useAppearance.getState();
        if (s.prefs.uiScale === s.appliedScale) {
          correct(pending, s.appliedScale);
          return;
        }
        // A zoom is on its way: wait for it to land.
        unsub = useAppearance.subscribe((next, prev) => {
          if (next.appliedScale === prev.appliedScale) return;
          unsub();
          settle();
        });
        timers.push(window.setTimeout(() => unsub(), ZOOM_TIMEOUT_MS));
      })
    );
  }, []);
}
