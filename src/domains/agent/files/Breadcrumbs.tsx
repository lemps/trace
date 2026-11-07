import { Fragment, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { I } from "@/components/Icon";
import { PopMenu } from "@/components/PopMenu";
import { type Crumb, type CrumbWidths, collapseCrumbs, crumbsOf } from "./filePaths";

interface BreadcrumbsProps {
  path: string;
  /** A rename's old path, shown after the crumbs. */
  oldPath?: string;
  /** Show a folder (`isDir`) or the file in the tree. */
  onReveal: (path: string, isDir: boolean) => void;
}

function Sep() {
  return (
    <span className="fx-crumb-sep" aria-hidden="true">
      <I.Chevron size={13} />
    </span>
  );
}

/** Every crumb's natural width, from a hidden copy drawn at full size. */
function useCrumbWidths(path: string) {
  const nav = useRef<HTMLElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ widths: CrumbWidths; available: number } | null>(null);
  // Re-measured for each path: the copy's crumbs change with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: path is the re-measure trigger
  useLayoutEffect(() => {
    const read = () => {
      const m = measure.current;
      const n = nav.current;
      if (!m || !n) return;
      const crumbs = [...m.querySelectorAll<HTMLElement>(".fx-crumb")].map((c) => c.offsetWidth);
      const sep = m.querySelector<HTMLElement>(".fx-crumb-sep")?.offsetWidth ?? 0;
      setFit({ widths: { crumbs, sep }, available: n.clientWidth });
    };
    read();
    const ro = new ResizeObserver(read);
    if (nav.current) ro.observe(nav.current);
    // The copy resizes when fonts or density change.
    if (measure.current) ro.observe(measure.current);
    return () => ro.disconnect();
  }, [path]);
  return { nav, measure, fit };
}

// The viewer's path as breadcrumbs, each revealing itself in the tree. When they
// don't fit (measured, not guessed), the first folder and the last two stay whole
// and the ones between fold into a "…" menu; the file name is the last to shrink.
export function Breadcrumbs({ path, oldPath, onReveal }: BreadcrumbsProps) {
  const crumbs = crumbsOf(path);
  const { nav, measure, fit } = useCrumbWidths(path);
  const hidden = fit ? collapseCrumbs(fit.widths, fit.available) : null;
  const lastIndex = crumbs.length - 1;

  const crumb = (c: Crumb, i: number) => (
    <button
      type="button"
      className={`fx-crumb${i === lastIndex ? " last" : ""}`}
      onClick={() => onReveal(c.path, i !== lastIndex)}
      title={`Show ${c.path}${i === lastIndex ? "" : "/"} in the tree`}
    >
      {c.name}
    </button>
  );

  const shown: ReactNode[] = [];
  crumbs.forEach((c, i) => {
    if (hidden && i > hidden[0] && i < hidden[1]) return;
    if (i > 0) shown.push(<Sep key={`sep-${c.path}`} />);
    if (hidden && i === hidden[0]) {
      const folded = crumbs.slice(hidden[0], hidden[1]);
      shown.push(
        <PopMenu
          key="more"
          align="left"
          sections={[
            {
              items: folded.map((f) => ({
                id: f.path,
                label: f.path,
                onSelect: () => onReveal(f.path, true),
              })),
            },
          ]}
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className={`fx-crumb more${open ? " on" : ""}`}
              onClick={toggle}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={`${folded.length} more folders`}
              title={folded.map((f) => f.name).join(" / ")}
            >
              …
            </button>
          )}
        />
      );
      return;
    }
    shown.push(<Fragment key={c.path}>{crumb(c, i)}</Fragment>);
  });

  return (
    <nav className="fx-crumbs" aria-label="File path" ref={nav}>
      <div className="fx-crumbs-measure" ref={measure} aria-hidden="true">
        {crumbs.map((c, i) => (
          <Fragment key={c.path}>
            {i === 1 && <Sep />}
            <span className="fx-crumb">{c.name}</span>
          </Fragment>
        ))}
      </div>
      {shown}
      {oldPath && <span className="fx-renamed">from {oldPath}</span>}
    </nav>
  );
}
