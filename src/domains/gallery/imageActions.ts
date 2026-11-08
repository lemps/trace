import { toast } from "@/app/toast";
import type { MenuSection } from "@/components/PopMenu";
import { type GalleryImage, galleryOpen, type OpenHow } from "@/ipc/gallery";

const isSvg = (img: GalleryImage) => /\.svg$/i.test(img.name);

function open(ws: string, setId: string, img: GalleryImage, how: OpenHow) {
  void galleryOpen(ws, setId, img.path, how).catch((e) => toast.error(String(e)));
}

export function copyPath(img: GalleryImage) {
  void navigator.clipboard.writeText(img.path).then(
    () => toast.success("Path copied"),
    () => toast.error("Couldn't copy the path")
  );
}

/**
 * What can be done with one image: copy its path, show it in its folder, open it in
 * its default app. Not for SVGs, whose default app is often a browser that would
 * run their scripts. The backend checks each path against the set again.
 */
export function imageMenu(ws: string, setId: string, img: GalleryImage): MenuSection[] {
  const svg = isSvg(img);
  return [
    {
      items: [
        { label: "Copy path", onSelect: () => copyPath(img) },
        { label: "Show in folder", onSelect: () => open(ws, setId, img, "reveal") },
        {
          label: "Open in default app",
          disabled: svg,
          title: svg ? "SVGs aren't opened outside trace: their app may run scripts" : undefined,
          onSelect: () => open(ws, setId, img, "open"),
        },
      ],
    },
  ];
}
