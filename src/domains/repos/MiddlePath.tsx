import { useLayoutEffect, useRef, useState } from "react";
import { shortenPath } from "./shortenPath";

interface MiddlePathProps {
  path: string;
  /** Quieter words after the path ("pushes as ron"), kept whole; the path gives way. */
  suffix?: string;
  className?: string;
}

/**
 * One character's width in `el`'s font (paths are mono, so one is enough). Measured
 * each time rather than cached: before the web font loads it would cache the fallback's.
 */
let canvas: HTMLCanvasElement | null = null;
function charWidth(el: HTMLElement): number {
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = getComputedStyle(el).font;
  return ctx.measureText("0000000000").width / 10;
}

// A path shortened in the middle to the width it's given (`shortenPath`): the
// start and the last folder stay. Its box takes its width from the layout (a grid
// cell, a flex item), never from the text, so measuring it can't feed back. The
// full path is its title only while it's shortened.
export function MiddlePath({ path, suffix, className }: MiddlePathProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const suffixRef = useRef<HTMLSpanElement>(null);
  const [max, setMax] = useState(Number.POSITIVE_INFINITY);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the suffix's width changes
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const char = charWidth(el);
      const room = el.clientWidth - (suffixRef.current?.offsetWidth ?? 0);
      setMax(
        char > 0 && room > 0 ? Math.max(4, Math.floor(room / char)) : Number.POSITIVE_INFINITY
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    let live = true;
    // The mono font may still be loading: measure again once it has.
    void document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [suffix]);

  const shown = shortenPath(path, max);
  return (
    <span ref={ref} className={`mid-path${className ? ` ${className}` : ""}`}>
      <span className="mid-path-text" title={shown === path ? undefined : path}>
        {shown}
      </span>
      {suffix && (
        <span ref={suffixRef} className="mid-path-suffix">
          {suffix}
        </span>
      )}
    </span>
  );
}
