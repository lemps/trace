import { type ReactNode, useId } from "react";

interface SettingSectionProps {
  /** The section's name, drawn as a section label (the tab already names the page). */
  title: string;
  /** One or two sentences under the label: what the section is for. */
  desc?: ReactNode;
  /** Controls for the whole section (a reset), right-aligned in the head. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * One section of a Settings tab: a head of fixed height (`--control-h`), so a section
 * with actions stands as tall as one without, its optional description, then its rows.
 * The title is a section label, not a heading that repeats the tab's name.
 */
export function SettingSection({ title, desc, actions, children }: SettingSectionProps) {
  const titleId = useId();
  return (
    <section className="setting-section" aria-labelledby={titleId}>
      <div className="setting-section-head">
        <h2 className="setting-section-title" id={titleId}>
          {title}
        </h2>
        {actions && <div className="setting-section-actions">{actions}</div>}
      </div>
      {desc && <div className="setting-section-desc">{desc}</div>}
      {children}
    </section>
  );
}
