import { useState } from "react";
import { ContextMenu } from "@/components/ContextMenu";
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
  const [menu, setMenu] = useState<{ x: number; y: number; img: GalleryImage } | null>(null);
  return (
    <div className="gl-grid">
      {images.map((img) => (
        <button
          key={img.path}
          type="button"
          className="gl-card"
          title={img.rel}
          onClick={() => onOpen(img)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, img });
          }}
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
          sections={imageMenu(workspaceId, setId, menu.img)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
