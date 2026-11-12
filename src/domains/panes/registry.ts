import { useSyncExternalStore } from "react";
import { create } from "zustand";
import type { Edge } from "./model";
import type { PanelDescriptor, PanelKind } from "./types";

// How a view the detail doesn't know about becomes a pane. A domain registers a
// panel kind once (at import), naming its panels `<prefix>:<rest>`; any detail that
// hosts the owning agent can then show one, and a stored layout naming one comes back
// after a reload without anything having to mount first. A kind that lists an agent's
// panels (`owned`) has them placed after that agent's tab by themselves (`owned.ts`);
// `showPanel` asks whichever detail hosts the owner to show one, `openPanel` to open
// it in a pane beside that agent.
//
//   registerPanelKind({
//     prefix: "sub",
//     resolve: (rest) => { const [owner, id] = splitOnce(rest); return { owner, panel: {...} } },
//     owned: (owner) => subagentsOf(owner).map((id) => `sub:${owner}:${id}`),
//   });
//   showPanel(`sub:${workspaceId}:${subagentId}`);   // e.g. from a subagent's card

const kinds = new Map<string, PanelKind>();

export function registerPanelKind(kind: PanelKind): void {
  kinds.set(kind.prefix, kind);
}

/**
 * The section an agent's tab and the tabs it owns share, so they read as one run
 * and the strip's divider falls after the last of them.
 */
export const runSection = (owner: string) => `run:${owner}`;

const subscribeAll = (onChange: () => void) => {
  const offs = [...kinds.values()].map((k) => k.subscribe?.(onChange) ?? (() => {}));
  return () => {
    for (const off of offs) off();
  };
};
const versionAll = () => [...kinds.values()].map((k) => k.version?.() ?? "").join("|");

/** Changes whenever a live kind's panels might resolve differently. */
export function usePanelKindsVersion(): string {
  return useSyncExternalStore(subscribeAll, versionAll);
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

/** The panels that place themselves after `owner`'s tab, in the order they started. */
export function ownedPanels(owner: string): string[] {
  return [...kinds.values()].flatMap((k) => k.owned?.(owner) ?? []);
}

export interface OpenRequest {
  id: string;
  /** Open it in a pane at this edge of its agent's; null: show it where it is. */
  edge: Edge | null;
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

function request(id: string, edge: Edge | null): void {
  useOpenRequests.setState((s) => ({
    pending: [...s.pending.filter((r) => r.id !== id), { id, edge, at: Date.now() }],
  }));
}

/**
 * Open an optional panel in a pane beside its owner agent's tab (or show it, if it
 * has one already). Picked up by the detail hosting the owner; ignored if none is open.
 */
export function openPanel(id: string, edge: Edge = "right"): void {
  request(id, edge);
}

/**
 * Show an optional panel and focus its pane, wherever it is; one not in the layout
 * yet goes after its agent's tab first. Picked up by the detail hosting the owner.
 */
export function showPanel(id: string): void {
  request(id, null);
}

import.meta.hot?.accept(() => location.reload());
