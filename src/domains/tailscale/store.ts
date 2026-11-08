import { useEffect } from "react";
import { create } from "zustand";
import { type TailscaleStatus, tailscaleStatus } from "@/ipc/tailscale";

// Tailscale on this computer: the tailnet it's on and the other devices there,
// which are the computers whose traces a session can run on. Tailscale's own app
// signs in and out; trace only reads its state.

interface TailscaleStore {
  /** Null until the first check finishes. */
  status: TailscaleStatus | null;
  loading: boolean;
  check: () => Promise<void>;
}

export const useTailscaleStore = create<TailscaleStore>((set, get) => ({
  status: null,
  loading: false,

  async check() {
    if (get().loading) return;
    set({ loading: true });
    try {
      set({ status: await tailscaleStatus() });
    } catch {
      // Asking failed outright: treat it as not set up, which the card explains.
      set({ status: { state: "notInstalled", tailnet: null, device: null, peers: [] } });
    } finally {
      set({ loading: false });
    }
  },
}));

/** Tailscale's status, checked once on first use. Null until then. */
export function useTailscaleStatus(): TailscaleStatus | null {
  const status = useTailscaleStore((s) => s.status);
  const check = useTailscaleStore((s) => s.check);
  useEffect(() => {
    if (!status) void check();
  }, [status, check]);
  return status;
}

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
