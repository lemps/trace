import { useState } from "react";
import { toast } from "@/app/toast";
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
  const [confirm, setConfirm] = useState(false);
  const count = listing?.images.length;
  const notes = listing ? listingNotes(listing) : [];
  const options = [set.recursive ? "with subfolders" : null, set.glob].filter(Boolean).join(" · ");
  return (
    <>
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
        {!confirm && (
          <button type="button" className="btn" onClick={() => setConfirm(true)}>
            Remove set
          </button>
        )}
      </div>
      {confirm && (
        <div className="pl-confirm">
          <span>Remove this set from the Gallery? The files stay where they are.</span>
          <button type="button" className="btn" onClick={() => setConfirm(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => void remove(workspaceId, set.id).catch((e) => toast.error(String(e)))}
          >
            Remove
          </button>
        </div>
      )}
    </>
  );
}
