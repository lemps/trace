import { type RefObject, useLayoutEffect, useRef, useState } from "react";

/** Within this many px of the bottom counts as "following along". */
const STICK_PX = 48;

export interface FollowScroll {
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The view is at the bottom, so new rows scroll into view. */
  following: boolean;
  onScroll: () => void;
  jumpToLatest: () => void;
}

/** Where a reader was: the row at the top of the view, and how far it had scrolled past. */
interface Place {
  anchor: string;
  offset: number;
}

// Where each remembered view was left, by its key. A pane's content unmounts while
// another tab of its pane is shown (a subagent's, Files), so without this a chat
// came back at the bottom, losing the place you were reading from.
const places = new Map<string, Place>();

const anchorsIn = (el: HTMLElement) => el.querySelectorAll<HTMLElement>("[data-follow-id]");

/** The first row still in view, and how far its top is above the view's. */
function placeOf(el: HTMLElement): Place | null {
  const top = el.getBoundingClientRect().top;
  for (const row of anchorsIn(el)) {
    const r = row.getBoundingClientRect();
    if (r.bottom > top && row.dataset.followId) {
      return { anchor: row.dataset.followId, offset: top - r.top };
    }
  }
  return null;
}

/** Put a remembered row back where it was. False if it isn't there any more. */
function goTo(el: HTMLElement, place: Place): boolean {
  for (const row of anchorsIn(el)) {
    if (row.dataset.followId !== place.anchor) continue;
    el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top + place.offset;
    return true;
  }
  return false;
}

/**
 * A scroll area that follows new content while you're at the bottom and stays
 * put while you read further up. `content` and `extra` change whenever the content
 * grows. With a `memoryKey`, a view left further up comes back there when it's
 * mounted again: its rows name themselves with `data-follow-id`.
 */
export function useFollowScroll(
  content: unknown,
  extra?: unknown,
  memoryKey?: string
): FollowScroll {
  const scrollRef = useRef<HTMLDivElement>(null);
  // A remembered place means it wasn't following: nothing may snap it to the bottom.
  const [startsAt] = useState(() => (memoryKey ? places.get(memoryKey) : undefined));
  const followingRef = useRef(startsAt === undefined);
  const [following, setFollowing] = useState(startsAt === undefined);

  // Back where it was left. After a frame: the pane's element is in the document
  // then, and rows above have their sizes; once more for rows that have just drawn
  // (off-screen turns are sized by estimate until they're scrolled to).
  useLayoutEffect(() => {
    if (!startsAt) return;
    let again = 0;
    const first = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el && goTo(el, startsAt)) {
        again = requestAnimationFrame(() => goTo(el, startsAt));
        return;
      }
      // The row is gone (a cleared conversation): follow along again.
      followingRef.current = true;
      setFollowing(true);
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(again);
    };
  }, [startsAt]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run whenever the content changes
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && followingRef.current) el.scrollTop = el.scrollHeight;
  }, [content, extra]);

  // The view shrinking (a notice or a taller composer below it) or its content
  // growing on its own (a diagram drawn, a card opened) keeps the bottom in view.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (followingRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  const noting = useRef(0);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    followingRef.current = near;
    setFollowing(near);
    if (!memoryKey) return;
    if (near) {
      places.delete(memoryKey);
      return;
    }
    // Once a frame at most: scrolling fires far more often than the place changes.
    if (noting.current) return;
    noting.current = requestAnimationFrame(() => {
      noting.current = 0;
      const now = scrollRef.current;
      // Out of the document (its tab was just hidden): keep what was noted last.
      if (!now?.isConnected || followingRef.current) return;
      const place = placeOf(now);
      if (place) places.set(memoryKey, place);
    });
  };
  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };
  return { scrollRef, following, onScroll, jumpToLatest };
}

// A hot update would leave readers on a stale copy of the remembered places, so reload.
import.meta.hot?.accept(() => location.reload());
