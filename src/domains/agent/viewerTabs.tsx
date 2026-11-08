import { browserTab } from "@/domains/browser/browserTab";
import { type BrowserTabState, useBrowserTab } from "@/domains/browser/store";
import { galleryTab } from "@/domains/gallery/galleryTab";
import { type GalleryTabState, useGalleryTab } from "@/domains/gallery/store";
import type { PanelDescriptor } from "@/domains/panes/types";

/** Whether an agent's Browser and Gallery tabs show, and their news. */
export interface ViewerTabsState {
  browser: BrowserTabState;
  gallery: GalleryTabState;
}

export function useViewerTabs(workspaceId: string): ViewerTabsState {
  return { browser: useBrowserTab(workspaceId), gallery: useGalleryTab(workspaceId) };
}

/**
 * The Browser and Gallery tabs of the agent `workspaceId`, after its Plan tab: what
 * it showed the user with open_browser and show_images. Both follow Plan's rules:
 * hidden until there's something in them, always listed in the pane menu.
 */
export function viewerTabs(
  workspaceId: string,
  state: ViewerTabsState,
  section?: string
): PanelDescriptor[] {
  return [
    browserTab(workspaceId, state.browser, section),
    galleryTab(workspaceId, state.gallery, section),
  ];
}
