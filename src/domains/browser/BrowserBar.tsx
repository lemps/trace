import { openUrl } from "@tauri-apps/plugin-opener";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { type BrowserAction, type BrowserPage, browserAct } from "@/ipc/browser";
import { copyPlain } from "@/ipc/clipboard";
import { suggestions, typedUrl } from "./model";
import { useBrowserStore, usePageLive } from "./store";

interface BrowserBarProps {
  workspaceId: string;
  page: BrowserPage;
  pages: BrowserPage[];
  /** The next address typed opens in a new page ("+"). */
  composing: boolean;
  onComposed: () => void;
}

const NAV: { action: BrowserAction; label: string; icon: typeof I.Back }[] = [
  { action: "back", label: "Back", icon: I.Back },
  { action: "forward", label: "Forward", icon: I.Chevron },
];

// Back, forward, reload (stop while loading), the address bar (Enter goes, Esc
// puts the page's address back; suggestions are every page's history), open in the
// system browser and copy the address. A thin bar under it shows a load.
export function BrowserBar({ workspaceId, page, pages, composing, onComposed }: BrowserBarProps) {
  const live = usePageLive(page.id);
  const go = useBrowserStore((s) => s.go);
  const openNew = useBrowserStore((s) => s.openUrl);
  const shown = live.url || page.url;
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = `bw-history-${page.id}`;

  useEffect(() => {
    if (!editing) setDraft(shown);
  }, [shown, editing]);
  useEffect(() => {
    if (!composing) return;
    setDraft("");
    setEditing(true);
    input.current?.focus();
  }, [composing]);

  const act = (action: BrowserAction) =>
    void browserAct(workspaceId, page.id, action).catch((e) => toast.error(String(e)));
  const done = () => {
    setEditing(false);
    onComposed();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = typedUrl(draft);
    if (!url) {
      toast.error("Type an address, like localhost:5173 or example.com.");
      return;
    }
    const run = composing ? openNew(workspaceId, url, true) : go(workspaceId, page.id, url);
    void run
      .then(() => {
        done();
        input.current?.blur();
      })
      .catch((err) => toast.error(String(err)));
  };
  const cancel = () => {
    done();
    setDraft(shown);
  };
  const copy = () =>
    void copyPlain(shown).then(
      () => toast.success("Address copied"),
      () => toast.error("Couldn't copy the address")
    );
  const reload = live.loading
    ? { action: "stop" as const, label: "Stop", icon: I.Stop }
    : { action: "reload" as const, label: "Reload", icon: I.Refresh };

  return (
    <div className="bw-bar">
      {[...NAV, reload].map(({ action, label, icon: Icon }) => (
        <IconButton key={action} size="sm" label={label} onClick={() => act(action)}>
          <Icon size={14} />
        </IconButton>
      ))}
      <form className="bw-address" onSubmit={submit}>
        <input
          ref={input}
          className="bw-address-input"
          aria-label={composing ? "Address for a new page" : "Address"}
          placeholder={composing ? "Open a new page: localhost:5173 or a URL" : "Address"}
          value={draft}
          list={listId}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setEditing(true);
            setDraft(e.target.value);
          }}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            if (draft === shown || !draft.trim()) cancel();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            cancel();
            e.currentTarget.blur();
          }}
        />
        <datalist id={listId}>
          {suggestions(pages).map((url) => (
            <option key={url} value={url} />
          ))}
        </datalist>
      </form>
      <IconButton
        size="sm"
        label="Open in your browser"
        onClick={() => void openUrl(shown).catch((e) => toast.error(String(e)))}
      >
        <I.External size={14} />
      </IconButton>
      <IconButton size="sm" label="Copy address" onClick={copy}>
        <I.Copy size={14} />
      </IconButton>
      {live.loading && <div className="bw-progress" aria-hidden />}
    </div>
  );
}
