import { I } from "@/components/Icon";

// Nothing shown yet: say how images get here.
export function GalleryEmpty() {
  return (
    <div className="pl-empty">
      <I.Images size={18} />
      <div className="pl-empty-title">No images yet</div>
      <p>
        Images show here when the agent points you at them: screenshots it took, charts or icons it
        made. Each set keeps its folder in view and picks up new files as they're written.
      </p>
    </div>
  );
}
