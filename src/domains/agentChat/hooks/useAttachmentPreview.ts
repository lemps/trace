import { useEffect, useState } from "react";
import { isImagePath } from "../attachmentFiles";
import { cachedPreview, loadPreview, type PreviewResult } from "../previewCache";

/**
 * The picture at `path` as a `data:` URL once it's read, or why there isn't
 * one. `undefined` while reading, and always for a file that isn't a picture
 * (nothing is read for those).
 */
export function useAttachmentPreview(path: string): PreviewResult | undefined {
  const image = isImagePath(path);
  const [result, setResult] = useState(() => (image ? cachedPreview(path) : undefined));
  useEffect(() => {
    if (!image) {
      setResult(undefined);
      return;
    }
    let live = true;
    setResult(cachedPreview(path));
    loadPreview(path).then((r) => {
      if (live) setResult(r);
    });
    return () => {
      live = false;
    };
  }, [path, image]);
  return result;
}
