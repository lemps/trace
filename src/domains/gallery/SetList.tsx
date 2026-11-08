import { I } from "@/components/Icon";
import type { GallerySet } from "@/ipc/gallery";
import { whereLabel } from "./model";

interface SetListProps {
  sets: GallerySet[];
  selected: string;
  onSelect: (id: string) => void;
}

// The sets, newest first: each one's title and where its images are.
export function SetList({ sets, selected, onSelect }: SetListProps) {
  return (
    <nav className="gl-sets" aria-label="Image sets">
      {sets.map((set) => (
        <button
          key={set.id}
          type="button"
          className={set.id === selected ? "gl-set active" : "gl-set"}
          aria-current={set.id === selected ? "true" : undefined}
          title={set.roots.join("\n")}
          onClick={() => onSelect(set.id)}
        >
          <span className="gl-set-title">
            <I.Images size={13} />
            <span className="gl-set-name">{set.title}</span>
          </span>
          <span className="gl-set-where">{whereLabel(set)}</span>
        </button>
      ))}
    </nav>
  );
}
