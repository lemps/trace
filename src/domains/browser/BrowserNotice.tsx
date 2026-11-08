import { openUrl } from "@tauri-apps/plugin-opener";
import { I } from "@/components/Icon";
import { useBrowserStore, usePageLive } from "./store";

// A quiet bar over the page: an agent opened another host (it's only showing a
// page, so no confirm, but the user should know where it is), or the page was
// refused something (a scheme the tab won't load, a download).
export function BrowserNotice({ pageId }: { pageId: string }) {
  const host = useBrowserStore((s) => s.notices[pageId]);
  const dismiss = useBrowserStore((s) => s.dismiss);
  const { blocked } = usePageLive(pageId);
  if (!host && !blocked) return null;
  // A download can happen in the system browser; anything else was refused for a reason.
  const external = blocked?.download && /^https?:/i.test(blocked.url);
  return (
    <div className="bw-notice" role="status">
      <I.Globe size={13} />
      <span className="bw-notice-text">
        {blocked ? (
          blocked.reason
        ) : (
          <>
            The agent opened <span className="bw-host">{host}</span>
          </>
        )}
      </span>
      {external && (
        <button
          type="button"
          className="btn ghost"
          onClick={() => void openUrl(blocked?.url ?? "")}
        >
          Open in your browser
        </button>
      )}
      <button type="button" className="btn ghost" onClick={() => dismiss(pageId)}>
        Dismiss
      </button>
    </div>
  );
}
