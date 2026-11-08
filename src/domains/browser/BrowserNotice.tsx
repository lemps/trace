import { openUrl } from "@tauri-apps/plugin-opener";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { useBrowserStore, usePageLive } from "./store";

// Quiet bars over the page. One says which host an agent's page is on when it isn't
// this machine (it's only showing a page, so no confirm, but the user should know
// where it is); a page can't hide it. The other says what the page was refused (a
// scheme the tab won't load, a download), each dismissed on its own.
export function BrowserNotice({ pageId }: { pageId: string }) {
  const host = useBrowserStore((s) => s.notices[pageId]);
  const dismiss = useBrowserStore((s) => s.dismiss);
  const clearBlocked = useBrowserStore((s) => s.clearBlocked);
  const { blocked } = usePageLive(pageId);
  // A download can happen in the system browser; anything else was refused for a reason.
  const canOpen = blocked?.download && /^https?:/i.test(blocked.url);
  return (
    <>
      {host && (
        <div className="bw-notice" role="status">
          <I.Globe size={14} />
          <span className="bw-notice-text">
            The agent opened <span className="bw-host">{host}</span>
          </span>
          <IconButton size="sm" className="ghost" label="Dismiss" onClick={() => dismiss(pageId)}>
            <I.X size={14} />
          </IconButton>
        </div>
      )}
      {blocked && (
        <div className="bw-notice" role="status">
          <I.Globe size={14} />
          <span className="bw-notice-text">{blocked.reason}</span>
          {canOpen && (
            <IconButton
              size="sm"
              className="ghost"
              label="Open in your browser"
              onClick={() => void openUrl(blocked.url)}
            >
              <I.External size={14} />
            </IconButton>
          )}
          <IconButton
            size="sm"
            className="ghost"
            label="Dismiss"
            onClick={() => clearBlocked(pageId)}
          >
            <I.X size={14} />
          </IconButton>
        </div>
      )}
    </>
  );
}
