import { ContextMenu } from "@/components/ContextMenu";
import { useContextMenuAt } from "@/components/useContextMenuAt";
import { type GalleryImage, imageSrc } from "@/ipc/gallery";
import { imageMenu } from "./imageActions";
import { formatSize } from "./model";

interface ImageGridProps {
  workspaceId: string;
  setId: string;
  images: GalleryImage[];
  onOpen: (img: GalleryImage) => void;
}

// Thumbnails with names and sizes. Each loads lazily and decodes off the main
// thread, scaled down by the browser; SVGs too, as `<img>`, so their scripts never
// run. Right-click (or the menu key) for the image's actions.
export function ImageGrid({ workspaceId, setId, images, onOpen }: ImageGridProps) {
  const { menu, openAt, close } = useContextMenuAt<GalleryImage>();
  return (
    <div className="gl-grid">
      {images.map((img) => (
        <button
          key={img.path}
          type="button"
          className="gl-card"
          title={img.rel}
          onClick={() => onOpen(img)}
          onContextMenu={openAt(img)}
        >
          <span className="gl-thumb">
            <img
              src={imageSrc(workspaceId, setId, img)}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </span>
          <span className="gl-card-name">{img.name}</span>
          <span className="gl-card-size">{formatSize(img.size)}</span>
        </button>
      ))}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sections={imageMenu(workspaceId, setId, menu.target)}
          onClose={close}
        />
      )}
    </div>
  );
}
