import { I } from "@/components/Icon";
import { comingFields } from "@/domains/panes/coming";
import type { PanelDescriptor } from "@/domains/panes/types";
import { GalleryPanel } from "./GalleryPanel";
import { GALLERY_TAB } from "./galleryTabId";
import type { GalleryTabState } from "./store";

/**
 * The Gallery tab as a panel, under the tabs rule (.claude/rules/tabs.md): there with
 * a set, hidden by its ×, back with the next set; a dot while a new one is unseen.
 * It opens empty, offering to show a folder.
 */
export function galleryTab(ws: string, state: GalleryTabState, section?: string): PanelDescriptor {
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
    ...comingFields(state.coming, true),
    render: () => <GalleryPanel workspaceId={ws} />,
  };
}
