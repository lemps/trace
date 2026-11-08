import { useCallback, useEffect, useRef, useState } from "react";

/** Whether something was just copied, and the call that marks it for a moment (the check mark). */
export function useCopied(ms = 1200): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const flash = useCallback(() => {
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), ms);
  }, [ms]);
  return [copied, flash];
}
