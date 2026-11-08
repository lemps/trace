import { useEffect, useState } from "react";
import { type SandboxState, sandboxState } from "@/ipc/vercel";

/** How often to re-ask Vercel while the Details are open. */
const POLL_MS = 60_000;

/**
 * A sandbox session's sandbox as Vercel reports it, re-read every minute while
 * the window is visible and whenever `refreshKey` changes (the agent starting or
 * stopping is when it moves). Null until the first answer, or if Vercel can't be
 * reached: the Details then say they're checking rather than guess.
 */
export function useSandboxState(workspaceId: string, refreshKey: unknown): SandboxState | null {
  const [state, setState] = useState<SandboxState | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a deliberate re-read trigger
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      sandboxState(workspaceId)
        .then((s) => {
          if (!cancelled) setState(s);
        })
        .catch(() => {
          // Best-effort: keep the last answer rather than flash an error.
        });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [workspaceId, refreshKey]);
  return state;
}
