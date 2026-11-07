import { create } from "zustand";
import type { Edge } from "./model";
import type { PanelDescriptor, PanelKind } from "./types";

// How a view the detail doesn't know about becomes a pane. A domain registers a
// panel kind once (at import), naming its panels `<prefix>:<rest>`; any detail that
// hosts the owning agent can then show one, and a stored layout naming one comes back
// after a reload without anything having to mount first. `openPanel` asks whichever
// detail hosts the owner to open it beside that agent.
//
//   registerPanelKind({
//     prefix: "sub",
//     resolve: (rest) => { const [owner, id] = splitOnce(rest); return { owner, panel: {...} } },
//   });
//   openPanel(`sub:${workspaceId}:${subagentId}`);   // e.g. from a subagent tab's menu

const kinds = new Map<string, PanelKind>();

export function registerPanelKind(kind: PanelKind): void {
  kinds.set(kind.prefix, kind);
}

/** The optional panel an id names, with the agent it belongs to — or null. */
export function resolvePanel(id: string): { owner: string; panel: PanelDescriptor } | null {
  const cut = id.indexOf(":");
  if (cut <= 0) return null;
  const kind = kinds.get(id.slice(0, cut));
  if (!kind) return null;
  const found = kind.resolve(id.slice(cut + 1));
  return found && found.panel.id === id ? found : null;
}

export interface OpenRequest {
  id: string;
  edge: Edge;
  at: number;
}

/** A request no detail picked up by then is stale (its detail wasn't open). */
const STALE_MS = 5000;

interface OpenRequests {
  pending: OpenRequest[];
  take: (accept: (r: OpenRequest) => boolean) => OpenRequest[];
}

export const useOpenRequests = create<OpenRequests>((set, get) => ({
  pending: [],
  take(accept) {
    const now = Date.now();
    const fresh = get().pending.filter((r) => now - r.at < STALE_MS);
    const mine = fresh.filter(accept);
    const rest = fresh.filter((r) => !mine.includes(r));
    // Only write a change: callers take from inside a subscription to this store.
    if (rest.length !== get().pending.length) set({ pending: rest });
    return mine;
  },
}));

/**
 * Open an optional panel in a pane beside its owner agent's tab (or show it, if it's
 * open already). Picked up by the detail hosting the owner; ignored if none is open.
 */
export function openPanel(id: string, edge: Edge = "right"): void {
  useOpenRequests.setState((s) => ({
    pending: [...s.pending.filter((r) => r.id !== id), { id, edge, at: Date.now() }],
  }));
}
