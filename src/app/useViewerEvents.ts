import { useEffect } from "react";
import { useBrowserStore } from "@/domains/browser/store";
import { useGalleryStore } from "@/domains/gallery/store";
import { onBrowserPages, onBrowserView } from "@/ipc/browser";
import { onGallerySets } from "@/ipc/gallery";

/**
 * The Browser and Gallery tabs hear from the backend: each live page's loads,
 * titles and refusals, and a workspace's pages or sets changing (a workspace
 * already shown reloads to pick them up).
 */
export function useViewerEvents(): void {
  useEffect(() => {
    const unlisteners = [
      onBrowserView((p) => useBrowserStore.getState().onView(p)),
      onBrowserPages(({ workspaceId }) => {
        const browser = useBrowserStore.getState();
        if (browser.loaded[workspaceId]) void browser.reload(workspaceId);
      }),
      onGallerySets(({ workspaceId }) => {
        const gallery = useGalleryStore.getState();
        if (gallery.loaded[workspaceId]) void gallery.reload(workspaceId);
      }),
    ];
    return () => {
      for (const u of unlisteners) void u.then((fn) => fn());
    };
  }, []);
}
