import { toast } from "@/app/toast";
import { InlineConfirm } from "@/components/InlineConfirm";
import type { GallerySet, Listing } from "@/ipc/gallery";
import { listingNotes, whereLabel } from "./model";
import { useGalleryStore } from "./store";

interface SetHeaderProps {
  workspaceId: string;
  set: GallerySet;
  listing: Listing | null;
}

// A set's title, where its images are and how many, and Remove set (confirmed
// inline). Removing only forgets the set: the files stay where they are.
export function SetHeader({ workspaceId, set, listing }: SetHeaderProps) {
  const remove = useGalleryStore((s) => s.remove);
  const count = listing?.images.length;
  const notes = listing ? listingNotes(listing) : [];
  const options = [set.recursive ? "with subfolders" : null, set.glob].filter(Boolean).join(" · ");
  return (
    <div className="gl-head">
      <div className="gl-head-text">
        <h2 className="gl-title">{set.title}</h2>
        <div className="gl-meta" title={set.roots.join("\n")}>
          <span className="gl-where">{whereLabel(set)}</span>
          {options && <span> · {options}</span>}
          {count !== undefined && (
            <span>
              {" "}
              · {count} image{count === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {notes.length > 0 && <div className="gl-meta">{notes.join(" ")}</div>}
      </div>
      <InlineConfirm
        label="Remove set"
        message="Remove from the Gallery? The files stay."
        confirmLabel="Remove"
        onConfirm={() => void remove(workspaceId, set.id).catch((e) => toast.error(String(e)))}
      />
    </div>
  );
}
