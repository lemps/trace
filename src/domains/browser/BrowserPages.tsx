import { I } from "@/components/Icon";
import type { BrowserPage } from "@/ipc/browser";
import { pageLabel } from "./model";
import { useBrowserStore } from "./store";

interface BrowserPagesProps {
  workspaceId: string;
  pages: BrowserPage[];
  active: string;
  onNew: () => void;
}

// The tab's pages as small tabs: a spinner while one loads, × to close it, + for a
// new one (the address bar then opens what's typed in a new page).
export function BrowserPages({ workspaceId, pages, active, onNew }: BrowserPagesProps) {
  const live = useBrowserStore((s) => s.live);
  const select = useBrowserStore((s) => s.select);
  const close = useBrowserStore((s) => s.close);
  return (
    <div className="bw-pages" role="tablist" aria-label="Pages">
      {pages.map((page) => {
        const state = live[page.id];
        const label = pageLabel(page, state?.title);
        const on = page.id === active;
        return (
          <div key={page.id} className={on ? "bw-page active" : "bw-page"} title={page.url}>
            <button
              type="button"
              role="tab"
              aria-selected={on}
              className="bw-page-pick"
              onClick={() => select(workspaceId, page.id)}
            >
              {state?.loading ? <span className="bw-spin" aria-hidden /> : <I.Globe size={12} />}
              <span className="bw-page-name">{label}</span>
            </button>
            <button
              type="button"
              className="bw-page-x"
              aria-label={`Close ${label}`}
              onClick={() => void close(workspaceId, page.id)}
            >
              <I.X size={11} />
            </button>
          </div>
        );
      })}
      <button type="button" className="bw-page-new" aria-label="New page" onClick={onNew}>
        <I.Plus size={12} />
      </button>
    </div>
  );
}
