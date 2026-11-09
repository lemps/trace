import { useEffect, useState } from "react";
import { Segmented } from "@/components/Segmented";
import { type FileDiff, readWorkspaceFile } from "@/ipc/diff";
import { MarkdownPreview } from "./files/MarkdownPreview";
import type { Change } from "./files/tree";
import { ViewerHeader } from "./files/ViewerHeader";

// Files we can render visually in the Preview pane (vs. the raw text diff).
type PreviewKind = "md" | "svg";
const previewKind = (path: string): PreviewKind | null => {
  if (/\.(md|markdown|mdx)$/i.test(path)) return "md";
  if (/\.svg$/i.test(path)) return "svg";
  return null;
};

// SVG via an <img> data URI, NOT inline HTML: loading an SVG through <img>
// makes the browser disable scripts and external fetches inside it, so a
// stray agent-authored <script>/href can't run or exfiltrate.
const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// One file's right pane: the unified diff, plus a Diff/Preview toggle that
// renders markdown or SVG files. A file with no changes (one picked in All files
// or Quick Open) shows its source instead of an empty diff. Remounted per file
// (keyed by path), so state starts fresh — preview defaults to the diff.
interface FileViewProps {
  fd: FileDiff;
  workspaceId: string;
  /** What changed, from the summary; none for an unchanged file. */
  change: Change | undefined;
  /** Show a folder (`isDir`) or this file in the tree. */
  onReveal: (path: string, isDir: boolean) => void;
}

export function FileView({ fd, workspaceId, change, onReveal }: FileViewProps) {
  const isGone = change?.status === "deleted";
  // A deleted file has nothing on disk to preview.
  const kind = isGone ? null : previewKind(fd.path);
  const isUnchanged = !change && fd.hunks.length === 0;
  const [preview, setPreview] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const needsContent = preview || isUnchanged;

  // Load the file's content only when it's shown: a preview, or an unchanged file's source.
  useEffect(() => {
    if (!needsContent) return;
    let cancelled = false;
    setContent(null);
    setContentError(null);
    readWorkspaceFile(workspaceId, fd.path)
      .then((c) => {
        if (!cancelled) setContent(c);
      })
      .catch((e) => {
        if (!cancelled) setContentError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [needsContent, workspaceId, fd.path]);

  const body = () => {
    if (!needsContent) return <DiffBody fd={fd} change={change} />;
    if (contentError) return <div className="diff-note">{contentError}</div>;
    if (content === null) return <div className="diff-note">Loading…</div>;
    if (!preview) return <SourceBody text={content} />;
    if (kind === "svg") {
      return (
        <div className="svg-preview">
          <div className="svg-canvas">
            <img src={svgDataUri(content)} alt={fd.path} />
          </div>
        </div>
      );
    }
    return <MarkdownPreview workspaceId={workspaceId} text={content} />;
  };

  return (
    <>
      <ViewerHeader workspaceId={workspaceId} path={fd.path} change={change} onReveal={onReveal}>
        {isUnchanged ? (
          <span className="fx-vstat unchanged">unchanged</span>
        ) : (
          <span className="fx-vstat">
            <span className="add">+{fd.add}</span>
            <span className="del">−{fd.del}</span>
          </span>
        )}
        {kind && (
          <Segmented
            label="Show"
            value={preview ? "preview" : "text"}
            options={[
              { value: "text", label: isUnchanged ? "Source" : "Diff" },
              { value: "preview", label: "Preview" },
            ]}
            onChange={(v) => setPreview(v === "preview")}
          />
        )}
      </ViewerHeader>
      {body()}
    </>
  );
}

function DiffBody({ fd, change }: { fd: FileDiff; change: Change | undefined }) {
  if (fd.hunks.length === 0) {
    const note =
      change?.status === "renamed"
        ? `Renamed from ${change.oldPath ?? "elsewhere"}, with no changes to its content.`
        : "No text diff — binary or empty file.";
    return <div className="diff-note">{note}</div>;
  }
  return (
    <>
      {fd.hunks.map((h) => (
        <div key={h.header}>
          <div className="diff-hunk">{h.header}</div>
          {h.lines.map((l) => (
            <div
              key={`${l.kind}:${l.oldNo ?? "_"}:${l.newNo ?? "_"}`}
              className={`diff-line ${l.kind}`}
            >
              <div className="ln">{l.oldNo ?? ""}</div>
              <div className="ln">{l.newNo ?? ""}</div>
              <div className="content">{l.text}</div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/** A whole file with line numbers, for a file that has no diff to show. */
/** Past this many lines a file is cut short: every line is a DOM row. */
const MAX_SOURCE_LINES = 3000;

function SourceBody({ text }: { text: string }) {
  if (text.length === 0) return <div className="diff-note">Empty file.</div>;
  const lines = text.replace(/\r?\n$/, "").split(/\r?\n/);
  return (
    <div className="src-body">
      {lines.slice(0, MAX_SOURCE_LINES).map((line, i) => (
        // Line numbers are the identity here: the file doesn't change under the view.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <div key={i} className="src-line">
          <div className="ln">{i + 1}</div>
          <div className="content">{line}</div>
        </div>
      ))}
      {lines.length > MAX_SOURCE_LINES && (
        <div className="diff-note">
          Showing the first {MAX_SOURCE_LINES.toLocaleString()} of {lines.length.toLocaleString()}{" "}
          lines. Open it in your editor for the rest.
        </div>
      )}
    </div>
  );
}

export function LoadingDiff() {
  return <div className="diff-note">Loading file diff…</div>;
}
