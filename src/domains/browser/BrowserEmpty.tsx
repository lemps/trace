import { type FormEvent, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { typedUrl } from "./model";
import { useBrowserStore } from "./store";

// Nothing open yet: say how pages get here, and let the user open one.
export function BrowserEmpty({ workspaceId }: { workspaceId: string }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const open = useBrowserStore((s) => s.openUrl);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = typedUrl(draft);
    if (!url) {
      toast.error("Type an address, like localhost:5173 or example.com.");
      return;
    }
    setBusy(true);
    void open(workspaceId, url, true)
      .catch((err) => toast.error(String(err)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="bw-empty">
      <I.Globe size={16} />
      <div className="bw-empty-title">No pages yet</div>
      <p>
        A page shows here when the agent opens one, usually the dev server it started or docs it
        wants you to see. Pages run apart from trace, and can't reach it or your files.
      </p>
      <form className="bw-empty-form" onSubmit={submit}>
        <input
          className="bw-address-input"
          aria-label="Address"
          placeholder="localhost:5173 or a URL"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn" disabled={busy || !draft.trim()}>
          Open
        </button>
      </form>
    </div>
  );
}
