import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { galleryShow } from "@/ipc/gallery";
import { useGalleryStore } from "./store";

// Nothing shown yet: say how images get here, and open a folder of them yourself.
export function GalleryEmpty({ workspaceId }: { workspaceId: string }) {
  const pickFolder = async () => {
    const dir = await open({ directory: true, title: "Show a folder of images" });
    if (typeof dir !== "string") return;
    try {
      await galleryShow(workspaceId, [dir], { title: null, recursive: false, glob: null });
      await useGalleryStore.getState().reload(workspaceId);
    } catch (e) {
      toast.error(`Couldn't show that folder: ${String(e)}`);
    }
  };
  return (
    <div className="pl-empty">
      <I.Images size={18} />
      <div className="pl-empty-title">No images yet</div>
      <p>
        Screenshots, charts or icons an agent points you at show here, and so does any folder you
        open. New files show up as they're written.
      </p>
      <button type="button" className="btn primary" onClick={() => void pickFolder()}>
        <I.FolderOpen size={13} /> Open a folder…
      </button>
    </div>
  );
}
