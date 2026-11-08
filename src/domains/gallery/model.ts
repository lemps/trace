import type { GallerySet, Listing } from "../../ipc/gallery.ts";

// The Gallery tab's pure rules: how a set and an image are described, when a
// re-listing changed anything, and stepping through images. When the tab shows is
// the tabs rule's (panes/coming.ts).

/** "812 B", "14.2 KB", "3.1 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Where a set's images are, in a line: its folder, or "3 folders". */
export function whereLabel(set: GallerySet): string {
  if (set.roots.length === 1) return set.roots[0];
  return `${set.roots.length} places`;
}

/** Changes whenever a re-listing would show something different. */
export function listingKey(listing: Listing): string {
  const parts = listing.images.map((i) => `${i.path}|${i.size}|${i.modified}`);
  return `${listing.tooLarge}|${listing.truncated}|${listing.missing.join(",")}|${parts.join("\n")}`;
}

/** The image `step` away from `index`, wrapping around; -1 with none. */
export function stepIndex(index: number, step: number, count: number): number {
  if (count === 0) return -1;
  return (((index + step) % count) + count) % count;
}

/** Notes under a set's header: what was left out, and what's gone. */
export function listingNotes(listing: Listing): string[] {
  const notes: string[] = [];
  if (listing.truncated) notes.push(`Showing the first ${listing.images.length} images.`);
  if (listing.tooLarge > 0) {
    notes.push(`${listing.tooLarge} over 25 MB left out.`);
  }
  for (const gone of listing.missing) notes.push(`${gone} is gone.`);
  return notes;
}
