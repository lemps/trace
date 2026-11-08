import { useEffect, useState } from "react";
import { BrowserBar } from "./BrowserBar";
import { BrowserEmpty } from "./BrowserEmpty";
import { BrowserNotice } from "./BrowserNotice";
import { BrowserPages } from "./BrowserPages";
import { NativePage } from "./NativePage";
import { activePage, useBrowserFile, useBrowserStore } from "./store";

// The Browser tab: the pages an agent (open_browser) or the user opened, as small
// tabs over an address bar, and the page itself in a native webview laid over the
// pane (`NativePage`). Opening the tab marks its news seen.
export function BrowserPanel({ workspaceId }: { workspaceId: string }) {
  const file = useBrowserFile(workspaceId);
  const unseen = useBrowserStore((s) => s.unseen[workspaceId] ?? false);
  const markSeen = useBrowserStore((s) => s.markSeen);
  // "+": the address bar opens what's typed next in a new page.
  const [composing, setComposing] = useState(false);
  const page = activePage(file);

  useEffect(() => {
    if (unseen) markSeen(workspaceId);
  }, [unseen, markSeen, workspaceId]);

  if (!page) {
    return (
      <div className="bw-pane">
        <BrowserEmpty workspaceId={workspaceId} />
      </div>
    );
  }
  return (
    <div className="bw-pane">
      <BrowserPages
        workspaceId={workspaceId}
        pages={file.pages}
        active={page.id}
        onNew={() => setComposing(true)}
      />
      <BrowserBar
        workspaceId={workspaceId}
        page={page}
        pages={file.pages}
        composing={composing}
        onComposed={() => setComposing(false)}
      />
      <BrowserNotice pageId={page.id} />
      <NativePage key={page.id} workspaceId={workspaceId} page={page} />
    </div>
  );
}
