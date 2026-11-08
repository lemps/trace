import { type RefObject, useEffect } from "react";
import { useTabDrag } from "@/domains/panes/drag";
import { type Bounds, browserHide, browserShow } from "@/ipc/browser";

// Keeps a page's native webview laid exactly over `ref`'s element, and hidden when
// it shouldn't be seen. A native view sits above the whole app, so nothing in the
// DOM can draw over it: while a menu, dialog or drop target overlaps the element it
// hides, and comes back when that goes.
//
// The element is measured every frame (a rect read, a few overlay checks) rather than
// observed, because panes move it without resizing it: a split, a drag, a side panel
// sliding in, a scroll. Only a change is sent, one call in flight at a time.

/** What can sit over a pane. Toasts are left out: they'd blank the page for seconds. */
const OVERLAYS = '[role="menu"], [role="dialog"], [role="listbox"], .modal-backdrop, .pn-drop';

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Whether something else in the app is over `el` (which the native view would hide). */
function covered(el: HTMLElement, r: DOMRect): boolean {
  if (useTabDrag.getState().drag) return true;
  for (const node of document.querySelectorAll(OVERLAYS)) {
    if (el.contains(node)) continue;
    if (overlaps(r, node.getBoundingClientRect())) return true;
  }
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit !== null && !el.contains(hit);
}

/** Where `el` is in the window's physical pixels, or null if it can't be seen. */
function placement(el: HTMLElement): Bounds | null {
  if (!el.isConnected || document.visibilityState !== "visible") return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4 || covered(el, r)) return null;
  // CSS pixels × devicePixelRatio: the screen's scaling and trace's own zoom both.
  const dpr = window.devicePixelRatio || 1;
  const x = Math.round(r.left * dpr);
  const y = Math.round(r.top * dpr);
  return {
    x,
    y,
    width: Math.round(r.right * dpr) - x,
    height: Math.round(r.bottom * dpr) - y,
  };
}

/**
 * Each page's show/hide calls, in order. Commands run concurrently backend-side, so
 * an old mount's hide could otherwise land after a new mount's show (a tab moved to
 * another pane) and leave the page hidden.
 */
const queues = new Map<string, Promise<unknown>>();
function inOrder(pageId: string, run: () => Promise<void>): Promise<void> {
  const next = (queues.get(pageId) ?? Promise.resolve()).catch(() => {}).then(run);
  queues.set(pageId, next);
  return next;
}

const key = (b: Bounds | null) => (b ? `${b.x},${b.y},${b.width},${b.height}` : "hidden");

/** After a failed show, the first retry's wait; it doubles each time, up to the cap. */
const RETRY_FIRST_MS = 250;
const RETRY_MAX_MS = 8000;

/**
 * Lay `pageId`'s webview over `ref` while mounted. `onError` hears why it couldn't
 * (once per run of failures), then `null` once it could again. A failed show is
 * retried with backoff; a hide is never held back, so the page can always get out
 * of the way of a menu or dialog.
 */
export function useNativeView(
  ref: RefObject<HTMLElement | null>,
  ws: string,
  pageId: string,
  onError: (why: string | null) => void
): void {
  useEffect(() => {
    let frame = 0;
    let sent = "";
    let busy = false;
    let dead = false;
    let want: Bounds | null = null;
    let backoff = 0;
    let retryAt = 0;
    let failing = false;
    const flush = () => {
      if (busy || key(want) === sent) return;
      const target = want;
      if (target && performance.now() < retryAt) return;
      busy = true;
      sent = key(target);
      const call = inOrder(pageId, () =>
        target ? browserShow(ws, pageId, target) : browserHide(ws, pageId)
      );
      call
        .then(() => {
          if (!target) return;
          backoff = 0;
          retryAt = 0;
          if (failing && !dead) onError(null);
          failing = false;
        })
        .catch((e: unknown) => {
          // Not where it was asked to be: ask again (a show after a wait).
          sent = "";
          if (target) {
            backoff = Math.min(backoff ? backoff * 2 : RETRY_FIRST_MS, RETRY_MAX_MS);
            retryAt = performance.now() + backoff;
          }
          if (!failing && !dead) onError(String(e));
          failing = true;
        })
        .finally(() => {
          busy = false;
          // Unmounted while a show was on its way: make sure it ends hidden.
          if (dead) void inOrder(pageId, () => browserHide(ws, pageId)).catch(() => {});
          else flush();
        });
    };
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const el = ref.current;
      if (!el) return;
      want = placement(el);
      flush();
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      dead = true;
      if (!busy) void inOrder(pageId, () => browserHide(ws, pageId)).catch(() => {});
    };
  }, [ref, ws, pageId, onError]);
}
