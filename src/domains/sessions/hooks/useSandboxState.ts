import { useEffect, useState } from "react";
import { type SandboxState, sandboxState } from "@/ipc/vercel";
import { sandboxPollMs } from "../sessionHost";

/**
 * A sandbox session's sandbox as Vercel reports it, read again while the window
 * is visible: every few seconds while it's on its way (starting, saving, or not
 * there yet with the agent running), once a minute once it has settled
 * (`sandboxPollMs`), and at once when `attached` changes or the window regains
 * focus. Null until the first answer, or if Vercel can't be reached: the Details
 * then say they're checking rather than guess.
 */
export function useSandboxState(workspaceId: string, attached: boolean): SandboxState | null {
  const [state, setState] = useState<SandboxState | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let last: string | null = null;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, sandboxPollMs(last, attached));
    };
    function load() {
      if (cancelled) return;
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
      sandboxState(workspaceId)
        .then((s) => {
          if (cancelled) return;
          // No answer (Vercel unreachable, or no sandbox) counts as none.
          last = s?.status ?? "";
          setState(s);
        })
        .catch(() => {
          // Best-effort: keep the last answer rather than flash an error.
        })
        .finally(() => {
          if (!cancelled) schedule();
        });
    }
    load();
    const now = () => {
      window.clearTimeout(timer);
      load();
    };
    window.addEventListener("focus", now);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", now);
    };
  }, [workspaceId, attached]);
  return state;
}
