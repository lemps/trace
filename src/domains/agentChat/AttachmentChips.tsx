import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { isImagePath, shownName } from "./attachmentFiles";
import { useAttachmentPreview } from "./hooks/useAttachmentPreview";

interface AttachmentChipsProps {
  paths: string[];
  saving: boolean;
  onRemove: (path: string) => void;
}

// The files going with the next message, above the composer's text: a chip per
// file (its full path in the tooltip) with a × to take it off. A picture shows
// a small thumbnail in place of its icon.
export function AttachmentChips({ paths, saving, onRemove }: AttachmentChipsProps) {
  if (paths.length === 0 && !saving) return null;
  return (
    <div className="ac-attachments">
      {paths.map((path) => (
        <AttachmentChip key={path} path={path} onRemove={onRemove} />
      ))}
      {saving && <span className="ac-attachment saving">Attaching…</span>}
    </div>
  );
}

function AttachmentChip({ path, onRemove }: { path: string; onRemove: (path: string) => void }) {
  const name = shownName(path);
  const preview = useAttachmentPreview(path);
  const url = preview && "url" in preview ? preview.url : null;
  const Icon = isImagePath(path) ? I.FileImage : I.File;
  return (
    <span className={`ac-attachment${url ? " has-thumb" : ""}`} title={path}>
      {url ? <img className="ac-attachment-thumb" src={url} alt="" /> : <Icon size={12} />}
      <span className="ac-attachment-name">{name}</span>
      <IconButton size="xs" className="ghost" label="Remove" onClick={() => onRemove(path)}>
        <I.X size={12} />
      </IconButton>
    </span>
  );
}
