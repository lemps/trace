import { useEffect } from "react";
import { create } from "zustand";
import type { ScratchSession } from "@/domains/sessions/types";
import {
  type ClaudeCredentialKind,
  clearClaudeCredential,
  connectVercel,
  disconnectVercel,
  joinRemoteSession,
  listRemoteSessions,
  type RemoteSandboxSession,
  setClaudeCredential,
  type VercelStatus,
  vercelStatus,
} from "@/ipc/vercel";

// The Vercel integration: whether trace is connected (and as whom), which Claude
// login sandboxes get, and the trace sessions living on Vercel. Secrets never come
// back from the backend, so nothing here holds one.

interface VercelStore {
  /** Null = not connected (or not checked yet: see `checked`). */
  status: VercelStatus | null;
  checked: boolean;
  /** A token is being checked with Vercel. */
  connecting: boolean;
  connectError: string | null;
  /** Every trace session on Vercel, from the last load. */
  remote: RemoteSandboxSession[];
  loadingRemote: boolean;

  check: () => Promise<void>;
  connect: (token: string) => Promise<void>;
  clearConnectError: () => void;
  disconnect: () => Promise<void>;
  setClaude: (kind: ClaudeCredentialKind, secret: string) => Promise<void>;
  clearClaude: () => Promise<void>;
  loadRemote: () => Promise<void>;
  /** Adopt a remote session locally; the caller lists and opens it. */
  join: (workspaceId: string) => Promise<ScratchSession>;
}

export const useVercelStore = create<VercelStore>((set, get) => ({
  status: null,
  checked: false,
  connecting: false,
  connectError: null,
  remote: [],
  loadingRemote: false,

  async check() {
    try {
      set({ status: await vercelStatus(), checked: true });
    } catch {
      // An unreadable config reads as not connected; the card offers to connect.
      set({ status: null, checked: true });
    }
  },
  async connect(token) {
    set({ connecting: true, connectError: null });
    try {
      set({ status: await connectVercel(token), checked: true });
    } catch (err) {
      set({ connectError: String(err) });
    } finally {
      set({ connecting: false });
    }
  },
  clearConnectError() {
    set({ connectError: null });
  },
  async disconnect() {
    await disconnectVercel();
    set({ status: null, remote: [] });
  },
  async setClaude(kind, secret) {
    set({ status: await setClaudeCredential(kind, secret) });
  },
  async clearClaude() {
    set({ status: await clearClaudeCredential() });
  },
  async loadRemote() {
    if (get().loadingRemote) return;
    set({ loadingRemote: true });
    try {
      set({ remote: await listRemoteSessions() });
    } finally {
      set({ loadingRemote: false });
    }
  },
  async join(workspaceId) {
    const session = await joinRemoteSession(workspaceId);
    set((s) => ({ remote: s.remote.filter((r) => r.workspaceId !== workspaceId) }));
    return session;
  },
}));

/** Vercel's status, checked once on first use. Null while unchecked or not connected. */
export function useVercelStatus(): VercelStatus | null {
  const status = useVercelStore((s) => s.status);
  const checked = useVercelStore((s) => s.checked);
  const check = useVercelStore((s) => s.check);
  useEffect(() => {
    if (!checked) void check();
  }, [checked, check]);
  return status;
}

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
