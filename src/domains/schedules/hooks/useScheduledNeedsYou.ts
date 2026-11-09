import { useLiveStore } from "@/domains/live/store";
import { runWorkspaceId } from "../ids";
import { useSchedulesStore } from "../store";

/**
 * Whether any live scheduled run is stuck waiting on the user — drives the
 * rail's badge. Same rule as `useRunNeedsYou`: its agent has a dialog open.
 */
export function useScheduledNeedsYou(): boolean {
  // Select stable references and derive here: a selector that builds a fresh
  // array on every call never settles under useSyncExternalStore.
  const runs = useSchedulesStore((s) => s.runs);
  const live = useLiveStore((s) => s.info);
  return runs.some((r) => r.status === "running" && live[runWorkspaceId(r.id)]?.ask != null);
}
