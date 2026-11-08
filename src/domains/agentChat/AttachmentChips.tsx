import { I } from "@/components/Icon";

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

/** A saved paste is `<8 hex>-<name>`; show the name. */
function shownName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/^[0-9a-f]{8}-(?=.)/, "");
}

interface AttachmentChipsProps {
  paths: string[];
  saving: boolean;
  onRemove: (path: string) => void;
}

// The files going with the next message, above the composer's text: a chip per
// file (its full path in the tooltip) with a × to take it off.
export function AttachmentChips({ paths, saving, onRemove }: AttachmentChipsProps) {
  if (paths.length === 0 && !saving) return null;
  return (
    <div className="ac-attachments">
      {paths.map((path) => {
        const name = shownName(path);
        const Icon = IMAGE.test(path) ? I.FileImage : I.File;
        return (
          <span key={path} className="ac-attachment" title={path}>
            <Icon size={12} />
            <span className="ac-attachment-name">{name}</span>
            <button
              type="button"
              className="ac-attachment-x"
              aria-label={`Remove ${name}`}
              onClick={() => onRemove(path)}
            >
              <I.X size={11} />
            </button>
          </span>
        );
      })}
      {saving && <span className="ac-attachment saving">Attaching…</span>}
    </div>
  );
}
