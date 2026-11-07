import type { ReactNode } from "react";

interface AppearanceGroupProps {
  title: string;
  desc?: string;
  /** What the group's settings change, drawn beside them and kept in view. */
  preview: ReactNode;
  children: ReactNode;
}

// One Settings → Appearance section: its settings on the left and a live
// preview of what they change on the right (stacked under them when the page
// is narrow; appearance.css).
export function AppearanceGroup({ title, desc, preview, children }: AppearanceGroupProps) {
  return (
    <section className="setting-group ap-group">
      <div className="ap-group-main">
        <h2>{title}</h2>
        {desc && <div className="desc">{desc}</div>}
        {children}
      </div>
      <aside className="ap-aside" aria-label={`${title} preview`}>
        <div className="ap-aside-label">Preview</div>
        {preview}
      </aside>
    </section>
  );
}
