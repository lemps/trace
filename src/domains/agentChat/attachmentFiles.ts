// Pure facts about an attached file, shared by the composer's chips and a sent
// message's strip. The image list matches the backend's (`attachments.rs`).

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

/** A picture the agent takes inline, and the chat can preview. */
export function isImagePath(path: string): boolean {
  return IMAGE.test(path);
}

/** The file's name; a saved paste is `<8 hex>-<name>`, so drop that prefix. */
export function shownName(path: string): string {
  const base = path.split(/[\\/]/).pop() || path;
  return base.replace(/^[0-9a-f]{8}-(?=.)/, "");
}

/** Why `attachment_preview` gave no picture (its `PreviewError`). */
export type PreviewErrorKind = "notImage" | "tooBig" | "missing";

/** The kind from a rejected preview; anything unexpected reads as missing. */
export function previewErrorKind(e: unknown): PreviewErrorKind {
  if (typeof e === "object" && e !== null && "kind" in e) {
    const kind = (e as { kind: unknown }).kind;
    if (kind === "notImage" || kind === "tooBig") return kind;
  }
  return "missing";
}
