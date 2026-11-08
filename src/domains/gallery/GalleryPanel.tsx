import { useEffect, useState } from "react";
import { AutoSidebar } from "@/components/AutoSidebar";
import { I } from "@/components/Icon";
import { GalleryEmpty } from "./GalleryEmpty";
import { ImageGrid } from "./ImageGrid";
import { ImageViewer } from "./ImageViewer";
import { SetHeader } from "./SetHeader";
import { SetList } from "./SetList";
import { useGallerySets, useGalleryStore, useListing } from "./store";

// The Gallery tab: the sets of images agents showed here, newest first (folding
// away while not pointed at: AutoSidebar), beside the one in view as a grid of
// thumbnails. A thumbnail opens the full-size viewer
// (zoom, pan, compare). The set in view re-lists itself every few seconds, so new
// and removed files show up. Opening the tab marks its news seen.
export function GalleryPanel({ workspaceId }: { workspaceId: string }) {
  const sets = useGallerySets(workspaceId);
  const picked = useGalleryStore((s) => s.picked[workspaceId] ?? null);
  const pick = useGalleryStore((s) => s.pick);
  const unseen = useGalleryStore((s) => s.unseen[workspaceId] ?? false);
  const markSeen = useGalleryStore((s) => s.markSeen);
  const current = sets.find((s) => s.id === picked) ?? sets[0] ?? null;

  useEffect(() => {
    if (unseen) markSeen(workspaceId);
  }, [unseen, markSeen, workspaceId]);

  if (!current) {
    return (
      <div className="gl-pane">
        <GalleryEmpty workspaceId={workspaceId} />
      </div>
    );
  }
  return (
    <div className="gl-pane">
      <div className="gl-split">
        <AutoSidebar id="gallery" label="Sets" icon={I.Images} count={sets.length} width={232}>
          <SetList sets={sets} selected={current.id} onSelect={(id) => pick(workspaceId, id)} />
        </AutoSidebar>
        <SetBody key={current.id} workspaceId={workspaceId} setId={current.id} />
      </div>
    </div>
  );
}

function SetBody({ workspaceId, setId }: { workspaceId: string; setId: string }) {
  const sets = useGallerySets(workspaceId);
  const set = sets.find((s) => s.id === setId);
  const { listing, error } = useListing(workspaceId, setId);
  const [open, setOpen] = useState<string | null>(null);
  if (!set) return null;
  const images = listing?.images ?? [];
  const index = open ? images.findIndex((i) => i.path === open) : -1;
  return (
    <div className="gl-main">
      <SetHeader workspaceId={workspaceId} set={set} listing={listing} />
      {error ? (
        <div className="gl-note">{error}</div>
      ) : listing && images.length === 0 ? (
        <div className="gl-note">No images here now. They show up again as files are added.</div>
      ) : (
        <ImageGrid
          workspaceId={workspaceId}
          setId={setId}
          images={images}
          onOpen={(img) => setOpen(img.path)}
        />
      )}
      {index >= 0 && (
        <ImageViewer
          workspaceId={workspaceId}
          setId={setId}
          images={images}
          index={index}
          onIndex={(i) => setOpen(images[i]?.path ?? null)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
