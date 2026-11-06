import { useEffect } from "react";
import { checkAppUpdate } from "@/ipc/update";
import { toast } from "./toast";

// Once per app run (module-level so StrictMode's double-mount can't re-check).
let updateCheckDone = false;

/**
 * Quiet update check shortly after launch — publishing a GitHub release IS the
 * rollout, so surface it without requiring a trip to Settings. Errors are silent
 * (dev builds have no release feed behind them).
 */
export function useUpdateCheck(): void {
  useEffect(() => {
    if (updateCheckDone) return;
    updateCheckDone = true;
    const t = setTimeout(() => {
      checkAppUpdate()
        .then((update) => {
          if (update) toast.info(`trace v${update.version} is available — Settings → Updates`);
        })
        .catch(() => {});
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}
