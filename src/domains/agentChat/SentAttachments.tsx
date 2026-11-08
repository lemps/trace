import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { I } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { existingAttachments } from "@/ipc/composer";
import { isImagePath, shownName } from "./attachmentFiles";
import { useAttachmentPreview } from "./hooks/useAttachmentPreview";

// What went with a message you sent, under its text: a thumbnail per picture
// (click for the whole picture) and a chip per other file. A file that's gone
// since shows as a quiet "missing" chip.

export function SentAttachments({ paths }: { paths: string[] }) {
  const files = paths.filter((p) => !isImagePath(p));
  const gone = useGone(files);
  const [open, setOpen] = useState<{ name: string; url: string } | null>(null);
  return (
    <div className="ac-sent-files">
      {paths.map((path) =>
        isImagePath(path) ? (
          <SentImage key={path} path={path} onOpen={setOpen} />
        ) : (
          <FileChip key={path} path={path} missing={gone.has(path)} />
        )
      )}
      {open &&
        createPortal(
          <Modal title={open.name} onClose={() => setOpen(null)} className="ac-image-modal">
            <img className="ac-image-full" src={open.url} alt={open.name} />
          </Modal>,
          document.body
        )}
    </div>
  );
}

function SentImage({
  path,
  onOpen,
}: {
  path: string;
  onOpen: (image: { name: string; url: string }) => void;
}) {
  const name = shownName(path);
  const preview = useAttachmentPreview(path);
  if (!preview) return <span className="ac-sent-thumb loading" title={path} />;
  if ("error" in preview) {
    return <FileChip path={path} missing={preview.error === "missing"} image />;
  }
  return (
    <button
      type="button"
      className="ac-sent-thumb"
      title={path}
      aria-label={`Open ${name}`}
      onClick={() => onOpen({ name, url: preview.url })}
    >
      <img src={preview.url} alt="" />
    </button>
  );
}

function FileChip({ path, missing, image }: { path: string; missing: boolean; image?: boolean }) {
  const Icon = image ? I.FileImage : I.File;
  return (
    <span className={`ac-sent-file${missing ? " missing" : ""}`} title={path}>
      <Icon size={12} />
      <span className="ac-sent-file-name">{shownName(path)}</span>
      {missing && <span className="ac-sent-file-note">missing</span>}
    </span>
  );
}

/** Of `files`, the ones no longer on disk. Nothing is marked until checked. */
function useGone(files: string[]): Set<string> {
  const key = files.join("\n");
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const list = key ? key.split("\n") : [];
    if (list.length === 0) return;
    let live = true;
    existingAttachments(list)
      .then((kept) => {
        const there = new Set(kept);
        if (live) setGone(new Set(list.filter((p) => !there.has(p))));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);
  return gone;
}
