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

/**
 * A scroll area that follows new content while you're at the bottom and stays
 * put while you read further up. `content` and `extra` change whenever the content grows.
 */
export function useFollowScroll(content: unknown, extra?: unknown): FollowScroll {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);

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

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    followingRef.current = near;
    setFollowing(near);
  };
  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };
  return { scrollRef, following, onScroll, jumpToLatest };
}
