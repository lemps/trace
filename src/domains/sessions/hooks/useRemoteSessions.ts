import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/app/toast";
import { useVercelStatus, useVercelStore } from "@/domains/vercel/store";
import type { RemoteSandboxSession } from "@/ipc/vercel";
import { useSessionsStore } from "../store";

export interface RemoteSessionsState {
  /** Vercel is connected, so the "On Vercel" group shows. */
  connected: boolean;
  /** Sessions on Vercel that aren't already one of this trace's sessions. */
  joinable: RemoteSandboxSession[];
  loading: boolean;
  /** The one being joined, if any. */
  joining: string | null;
  refresh: () => void;
  /** Adopt it as a local session, then open it as the list opens any session. */
  join: (workspaceId: string) => void;
}

/**
 * The Sessions page's "On Vercel" group: the trace sessions living in Vercel
 * sandboxes (started by this trace or another with the same token) that this
 * trace doesn't have yet. Loaded when the page mounts and on Refresh.
 */
export function useRemoteSessions(): RemoteSessionsState {
  const connected = useVercelStatus() !== null;
  const remote = useVercelStore((s) => s.remote);
  const loading = useVercelStore((s) => s.loadingRemote);
  const loadRemote = useVercelStore((s) => s.loadRemote);
  const joinRemote = useVercelStore((s) => s.join);
  const sessions = useSessionsStore((s) => s.sessions);
  const adopt = useSessionsStore((s) => s.adopt);
  const select = useSessionsStore((s) => s.select);
  const [joining, setJoining] = useState<string | null>(null);

  const refresh = useCallback(() => {
    loadRemote().catch((err) =>
      toast.error(`Couldn't list your sessions on Vercel: ${String(err)}`)
    );
  }, [loadRemote]);
  useEffect(() => {
    if (connected) refresh();
  }, [connected, refresh]);

  const joinable = useMemo(() => {
    const local = new Set(sessions.map((s) => s.id));
    return remote.filter((r) => !local.has(r.workspaceId));
  }, [remote, sessions]);

  const join = (workspaceId: string) => {
    if (joining) return;
    setJoining(workspaceId);
    joinRemote(workspaceId)
      .then((session) => {
        adopt(session);
        select(session.id);
      })
      .catch((err) => toast.error(`Couldn't join the session: ${String(err)}`))
      .finally(() => setJoining(null));
  };

  return { connected, joinable, loading, joining, refresh, join };
}
