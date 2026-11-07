import { useEffect, useState } from "react";

/** The time now (unix ms), ticking each second while `live`; frozen otherwise. */
export function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [live]);
  return now;
}
