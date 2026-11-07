import { useEffect, useState } from "react";
import { workspaceInfo } from "@/ipc/workspace";

/** The workspace's directory, so paths inside it read relative to it. */
export function useWorkspaceRoot(workspaceId: string): string | null {
  const [root, setRoot] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void workspaceInfo(workspaceId)
      .then((info) => {
        if (!cancelled) setRoot(info?.cwd ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);
  return root;
}
