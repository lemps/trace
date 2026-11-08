import { attachmentPreview } from "@/ipc/agentChat";
import { type PreviewErrorKind, previewErrorKind } from "./attachmentFiles";

// Attached pictures as `data:` URLs, by path, so a chip or a sent message that
// re-renders (or scrolls back into view) doesn't read its file again. A missing
// file isn't remembered: it may come back. The oldest go past `KEEP`.

export type PreviewResult = { url: string } | { error: PreviewErrorKind };

interface Entry {
  promise: Promise<PreviewResult>;
  result?: PreviewResult;
}

/** Previews kept; each is a whole picture, up to 10 MB. */
const KEEP = 40;

const cache = new Map<string, Entry>();

/** The preview for `path` if it's already read, for a first render without a flash. */
export function cachedPreview(path: string): PreviewResult | undefined {
  return cache.get(path)?.result;
}

/** The preview for `path`, read once and shared by everyone asking. */
export function loadPreview(path: string): Promise<PreviewResult> {
  const hit = cache.get(path);
  if (hit) return hit.promise;
  const entry: Entry = {
    promise: attachmentPreview(path).then(
      (url): PreviewResult => ({ url }),
      (e: unknown): PreviewResult => ({ error: previewErrorKind(e) })
    ),
  };
  entry.promise.then((result) => {
    entry.result = result;
    if ("error" in result && result.error === "missing") cache.delete(path);
  });
  cache.set(path, entry);
  while (cache.size > KEEP) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return entry.promise;
}

import.meta.hot?.accept(() => location.reload());
