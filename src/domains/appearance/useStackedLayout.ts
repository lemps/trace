import { useEffect, useState } from "react";
import { isStacked } from "./anchor";
import { useAppearance } from "./store";

// Settings → Appearance lays each preview beside its settings, or above them in
// a narrow window. A container query decided that before, in CSS px, so zooming
// in (fewer CSS px) flipped the page to stacked under the pointer. This decides
// it from the window's width in screen points instead, which a zoom doesn't
// change: only resizing the window can flip it.

/** After a zoom lands, its resize events are ignored this long, then the width is read again. */
const SETTLE_MS = 300;

function measure(): boolean {
  return isStacked(window.innerWidth, useAppearance.getState().appliedScale);
}

/** Whether Appearance's groups stack (preview above settings) at this window width. */
export function useStackedLayout(): boolean {
  const [stacked, setStacked] = useState(measure);

  useEffect(() => {
    // innerWidth and the zoom on screen only agree once a zoom has landed and
    // settled; while one is in flight, a resize is the zoom's, not the window's.
    let settleUntil = 0;
    let timer = 0;
    const zoomPending = () => {
      const s = useAppearance.getState();
      return s.prefs.uiScale !== s.appliedScale;
    };
    const recheck = () => {
      if (zoomPending() || Date.now() < settleUntil) return;
      setStacked(measure());
    };
    const unsub = useAppearance.subscribe((next, prev) => {
      if (next.appliedScale === prev.appliedScale) return;
      settleUntil = Date.now() + SETTLE_MS;
      clearTimeout(timer);
      timer = window.setTimeout(recheck, SETTLE_MS + 16);
    });
    window.addEventListener("resize", recheck);
    return () => {
      unsub();
      clearTimeout(timer);
      window.removeEventListener("resize", recheck);
    };
  }, []);

  return stacked;
}
