import { useMemo, useState } from "react";
import { I } from "@/components/Icon";
import { FileLink } from "@/domains/transcript/FileLink";
import { resolvePath, useChatView } from "./chatContext";
import { useDisclosure } from "./hooks/useDisclosure";
import { countChanges, type DiffLine, linesOf } from "./lineDiff";
import type { ChangeKind, FileDiff } from "./types";

// A file the agent changed: path, what happened to it and +/− counts, opening
// to the diff in the Files tab's colours (`.diff-line`). Small diffs start open;
// big ones start folded and, open, draw their first lines until asked for all.

/** Diffs up to this many lines start open. */
const OPEN_LINES = 24;
/** Lines drawn before "Show all". */
const FIRST_LINES = 300;

const CHANGE: Record<ChangeKind, string> = { add: "Added", edit: "Edited", delete: "Deleted" };

export function DiffCard({ diff }: { diff: FileDiff }) {
  const { workspaceId, root } = useChatView();
  const lines = useMemo(() => linesOf(diff), [diff]);
  const { added, removed } = countChanges(lines);
  const [open, toggle] = useDisclosure(lines.length <= OPEN_LINES);
  return (
    <div className={`ac-diff${open ? " open" : ""}`}>
      <div className="ac-diff-head">
        <button
          type="button"
          className="ac-diff-toggle"
          aria-expanded={open}
          aria-label={open ? "Fold the diff" : "Show the diff"}
          onClick={toggle}
        >
          <span className="tx-chev">
            <I.Chevron size={12} />
          </span>
          <span className={`ac-change ${diff.change}`}>{CHANGE[diff.change]}</span>
        </button>
        <FileLink workspaceId={workspaceId} path={resolvePath(diff.path, root)} root={root} />
        <span className="ac-diff-stat">
          {added > 0 && <span className="add">+{added}</span>}
          {removed > 0 && <span className="del">−{removed}</span>}
        </span>
      </div>
      {open && <DiffLines lines={lines} />}
    </div>
  );
}

function DiffLines({ lines }: { lines: DiffLine[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? lines : lines.slice(0, FIRST_LINES);
  return (
    <div className="ac-diff-body">
      {shown.map((l, i) =>
        l.kind === "gap" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines of a fixed diff
          <div key={i} className="diff-hunk">
            {l.text}
          </div>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines of a fixed diff
          <div key={i} className={`diff-line ${l.kind}`}>
            <span className="ln">{l.oldNo ?? ""}</span>
            <span className="ln">{l.newNo ?? ""}</span>
            <span className="content">{l.text}</span>
          </div>
        )
      )}
      {!all && lines.length > FIRST_LINES && (
        <button type="button" className="btn ghost ac-diff-more" onClick={() => setAll(true)}>
          Show all {lines.length} lines
        </button>
      )}
    </div>
  );
}
