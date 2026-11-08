import { I } from "@/components/Icon";
import { MoreTrigger, PopMenu } from "@/components/PopMenu";
import { Segmented } from "@/components/Segmented";
import type { GalleryImage } from "@/ipc/gallery";
import { imageMenu } from "./imageActions";
import { formatSize } from "./model";

export interface Compare {
  mode: "side" | "swipe";
  /** The second image's index in the set. */
  other: number;
}

interface ViewerBarProps {
  workspaceId: string;
  setId: string;
  img: GalleryImage;
  other: GalleryImage | undefined;
  index: number;
  count: number;
  /** The image's scale as drawn. */
  scale: number;
  fit: boolean;
  compare: Compare | null;
  onFit: () => void;
  onActual: () => void;
  onCompare: (mode: Compare["mode"] | null) => void;
  onClose: () => void;
}

type Mode = "single" | Compare["mode"];

const MODES: { value: Mode; label: string }[] = [
  { value: "single", label: "One" },
  { value: "side", label: "Side by side" },
  { value: "swipe", label: "Swipe" },
];

// The viewer's header: which image (and against which), Fit / 1:1 and the zoom,
// the comparison mode, the image's actions, and close.
export function ViewerBar(p: ViewerBarProps) {
  const zoom = p.fit ? "Fit" : `${Math.round(p.scale * 100)}%`;
  return (
    <div className="gv-bar">
      <div className="gv-what">
        <span className="gv-name" title={p.img.path}>
          {p.img.name}
          {p.other && <span className="gv-vs"> vs {p.other.name}</span>}
        </span>
        <span className="gv-meta">
          {p.index + 1} / {p.count} · {formatSize(p.img.size)} ·{" "}
          <span className="gv-zoom">{p.fit ? `Fit (${Math.round(p.scale * 100)}%)` : zoom}</span>
        </span>
      </div>
      <div className="gv-actions">
        <Segmented
          label="Compare"
          value={p.compare?.mode ?? "single"}
          options={p.count > 1 ? MODES : MODES.slice(0, 1)}
          onChange={(m) => p.onCompare(m === "single" ? null : m)}
        />
        <Segmented
          label="Zoom"
          value={p.fit ? "fit" : p.scale === 1 ? "actual" : "custom"}
          options={[
            { value: "fit", label: "Fit" },
            { value: "actual", label: "1:1" },
          ]}
          onChange={(v) => (v === "fit" ? p.onFit() : p.onActual())}
        />
        <PopMenu
          trigger={({ toggle }) => <MoreTrigger toggle={toggle} label="Image actions" />}
          sections={imageMenu(p.workspaceId, p.setId, p.img)}
        />
        <button
          type="button"
          className="btn icon"
          aria-label="Close viewer"
          title="Close (Esc)"
          onClick={p.onClose}
        >
          <I.X size={14} />
        </button>
      </div>
    </div>
  );
}
