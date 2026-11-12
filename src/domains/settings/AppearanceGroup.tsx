import { type ReactNode, useState } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { ConfirmPrompt } from "@/components/InlineConfirm";

interface AppearanceGroupProps {
  title: string;
  desc?: string;
  /** What the group's settings change, drawn beside them and kept in view. */
  preview: ReactNode;
  /** Put the group's settings back to their defaults (asked first). */
  onReset: () => void;
  children: ReactNode;
}

// One Settings → Appearance section: a head (title, reset, one-line
// description), its settings, and a live preview of what they change: beside
// them, or above them when the window is narrow (appearance.css). The preview
// is a picture: hidden from assistive tech, and `inert` inside.
export function AppearanceGroup({ title, desc, preview, onReset, children }: AppearanceGroupProps) {
  return (
    <section className="setting-group ap-group">
      <div className="ap-group-intro">
        <div className="ap-group-head">
          <h2>{title}</h2>
          <GroupReset title={title} onReset={onReset} />
        </div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <aside className="ap-aside" aria-hidden="true">
        <div className="ap-aside-label">Preview</div>
        {preview}
      </aside>
      <div className="ap-group-main">{children}</div>
    </section>
  );
}

/**
 * The head's reset: a quiet icon that arms an `sm` confirm in its place. The
 * head is the `sm` control's height either way, so arming it moves nothing.
 */
function GroupReset({ title, onReset }: { title: string; onReset: () => void }) {
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <ConfirmPrompt
        size="sm"
        message={`Reset ${title}?`}
        confirmLabel="Reset"
        onCancel={() => setArmed(false)}
        onConfirm={() => {
          setArmed(false);
          onReset();
        }}
      />
    );
  }
  return (
    <IconButton size="sm" className="ghost" label={`Reset ${title}`} onClick={() => setArmed(true)}>
      <I.RotateCcw size={14} />
    </IconButton>
  );
}
