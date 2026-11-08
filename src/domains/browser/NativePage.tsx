import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useRef, useState } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import type { BrowserPage } from "@/ipc/browser";
import { usePageLive } from "./store";
import { useNativeView } from "./useNativeView";

// Where the page shows. The page itself is a native webview (`browser::webview`)
// laid over this element, so what's in it here is only seen while that view is
// hidden (a menu over the pane) or couldn't open.
export function NativePage({ workspaceId, page }: { workspaceId: string; page: BrowserPage }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const live = usePageLive(page.id);
  const onError = useCallback((why: string | null) => setError(why), []);
  useNativeView(ref, workspaceId, page.id, onError);
  return (
    <div className="bw-view" ref={ref}>
      {error ? (
        <div className="bw-fail">
          <p>{error}</p>
          <IconButton label="Open in your browser" onClick={() => void openUrl(page.url)}>
            <I.External size={14} />
          </IconButton>
        </div>
      ) : (
        <span className="bw-under">{live.url || page.url}</span>
      )}
    </div>
  );
}
