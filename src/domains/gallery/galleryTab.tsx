import { I } from "@/components/Icon";
import type { PanelDescriptor } from "@/domains/panes/types";
import { GalleryPanel } from "./GalleryPanel";
import { type GalleryTabState, useGalleryStore } from "./store";

export const GALLERY_TAB = "gallery";

export const GALLERY_MENU_HINT = "Appears when the agent shows you a folder of images";

/**
 * The Gallery tab as a panel: only there with a set to show, with a dot while a new
 * one is unseen. The pane menu always lists it; opened from there empty, it says
 * how images get here and closes again with its ×.
 */
export function galleryTab(ws: string, state: GalleryTabState, section?: string): PanelDescriptor {
  const reveal = (on: boolean) => useGalleryStore.getState().reveal(ws, on);
  return {
    id: GALLERY_TAB,
    label: "Gallery",
    icon: I.Images,
    title: "Images the agent showed you",
    badge: state.unseen ? (
      <span className="pl-dot" role="img" aria-label="New images" />
    ) : state.count > 1 ? (
      <span className="count">{state.count}</span>
    ) : undefined,
    section,
    hidden: !state.visible,
    menuHint: GALLERY_MENU_HINT,
    onReveal: () => reveal(true),
    onClose: state.peeking ? () => reveal(false) : undefined,
    render: () => <GalleryPanel workspaceId={ws} />,
  };
}
