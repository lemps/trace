import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import type { PrThread } from "@/ipc/prWatch";
import { PrChecks } from "./PrChecks";
import { PrConversation } from "./PrConversation";
import { prStateLabel } from "./prState";
import { relTime } from "./relTime";
import { usePrWatchStore } from "./watchStore";

const DECISION_TEXT = {
  approved: "Approved",
  changes: "Changes requested",
  review: "Review required",
};

/** "acme/web#12": enough to tell two PRs apart at a glance. */
function shortRef(url: string): string {
  const m = url.match(/github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/);
  return m ? `${m[1]}#${m[2]}` : url;
}

function copyLink(url: string) {
  void navigator.clipboard.writeText(url).then(
    () => toast.success("Copied PR link"),
    () => toast.error("Couldn't copy to clipboard")
  );
}

/** The PR's title and actions, then one line of facts: state, branches, size, review, author. */
function PrHeader({ pr }: { pr: PrThread }) {
  return (
    <header className="prp-head">
      <div className="prp-title-row">
        <h2 className="prp-title">
          {pr.title} <span className="prp-num">#{pr.number}</span>
        </h2>
        <div className="prp-actions">
          <IconButton label="Open on GitHub" onClick={() => void openUrl(pr.url)}>
            <I.External size={14} />
          </IconButton>
          <IconButton label="Files on GitHub" onClick={() => void openUrl(`${pr.url}/files`)}>
            <I.FileDiff size={14} />
          </IconButton>
          <IconButton label="Copy the PR's link" onClick={() => copyLink(pr.url)}>
            <I.Copy size={14} />
          </IconButton>
        </div>
      </div>
      <div className="prp-meta">
        <span className={`pr-pill ${pr.state}`}>{prStateLabel(pr.state)}</span>
        {pr.reviewDecision && (
          <span className={`pr-pill ${pr.reviewDecision}`}>{DECISION_TEXT[pr.reviewDecision]}</span>
        )}
        <span className="prp-branch" title={`${pr.headRef} → ${pr.baseRef}`}>
          {pr.headRef} → {pr.baseRef}
        </span>
        <span className="prp-diffstat">
          <b className="add">+{pr.additions}</b> <b className="del">−{pr.deletions}</b>
        </span>
        <span className="prp-by">
          {pr.author} · updated {relTime(pr.updatedAt)}
        </span>
      </div>
    </header>
  );
}

/** One chip per PR when the workspace raised several. */
function PrPicker({
  urls,
  selected,
  onPick,
}: {
  urls: string[];
  selected: string;
  onPick: (url: string) => void;
}) {
  const threads = usePrWatchStore((s) => s.threads);
  return (
    <div className="prp-picker" role="tablist" aria-label="Pull requests">
      {urls.map((u) => {
        const t = threads[u];
        return (
          <button
            type="button"
            role="tab"
            key={u}
            aria-selected={u === selected}
            className={`prp-pick${u === selected ? " on" : ""}`}
            onClick={() => onPick(u)}
            title={t?.title ?? u}
          >
            <span className="prp-pick-ref">{shortRef(u)}</span>
            {t && <span className={`pr-pill ${t.state}`}>{prStateLabel(t.state)}</span>}
          </button>
        );
      })}
    </div>
  );
}

// The Pull request tab: every PR the workspace raised (`usePrWatch`: its branch's,
// and the ones its conversation created), one at a time in a centred column like
// the chat's. Its header names it and opens it; its checks and conversation follow.
export function PrPane({ urls }: { urls: string[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const threads = usePrWatchStore((s) => s.threads);
  const errors = usePrWatchStore((s) => s.errors);
  if (urls.length === 0) return null;

  // An explicit pick, then the first still-open PR, then the first.
  const openOne = urls.find((u) => {
    const st = threads[u]?.state;
    return st === "open" || st === "draft";
  });
  const selected = picked && urls.includes(picked) ? picked : (openOne ?? urls[0]);
  const pr = threads[selected];

  return (
    <div className="prp">
      {urls.length > 1 && <PrPicker urls={urls} selected={selected} onPick={setPicked} />}
      {pr ? (
        <>
          <PrHeader pr={pr} />
          {pr.checkRuns.length > 0 && (
            <section className="prp-section">
              <PrChecks checks={pr.checkRuns} />
            </section>
          )}
          <section className="prp-section">
            <PrConversation pr={pr} />
          </section>
        </>
      ) : errors[selected] ? (
        <div className="prp-note" title={errors[selected]}>
          Couldn't read {shortRef(selected)}: {errors[selected].replace(/^gh:\s*/, "")}
        </div>
      ) : (
        <div className="prp-note">Loading {shortRef(selected)}…</div>
      )}
    </div>
  );
}
