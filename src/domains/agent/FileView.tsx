import { useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { type FileDiff, readWorkspaceFile } from "@/ipc/diff";

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
// renders markdown or SVG files. A file with no changes (one Quick Open picked)
// shows its source instead of an empty diff. Remounted per file (keyed by path),
// so state starts fresh — preview defaults to the diff.
interface FileViewProps {
  fd: FileDiff;
  workspaceId: string;
  /** In the workspace's changed files; false for one opened from Quick Open. */
  isChanged: boolean;
}

export function FileView({ fd, workspaceId, isChanged }: FileViewProps) {
  const kind = previewKind(fd.path);
  const isUnchanged = !isChanged && fd.hunks.length === 0;
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
    if (!needsContent) return <DiffBody fd={fd} />;
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
    return (
      <div className="md-doc">
        <Markdown text={content} />
      </div>
    );
  };

  return (
    <>
      <div className="diff-head">
        <span className="path">{fd.path}</span>
        <span className="stat">
          {isUnchanged ? (
            <span className="unchanged">unchanged</span>
          ) : (
            <>
              <span style={{ color: "var(--c-done)" }}>+{fd.add}</span>{" "}
              <span style={{ color: "var(--c-danger)" }}>−{fd.del}</span>
            </>
          )}
        </span>
        {kind && (
          <span className="view-toggle">
            <button
              type="button"
              className={preview ? "" : "active"}
              onClick={() => setPreview(false)}
            >
              {isUnchanged ? "Source" : "Diff"}
            </button>
            <button
              type="button"
              className={preview ? "active" : ""}
              onClick={() => setPreview(true)}
            >
              Preview
            </button>
          </span>
        )}
      </div>
      {body()}
    </>
  );
}

function DiffBody({ fd }: { fd: FileDiff }) {
  if (fd.hunks.length === 0) {
    return <div className="diff-note">No text diff — binary or empty file.</div>;
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
function SourceBody({ text }: { text: string }) {
  if (text.length === 0) return <div className="diff-note">Empty file.</div>;
  const lines = text.replace(/\r?\n$/, "").split(/\r?\n/);
  return (
    <div className="src-body">
      {lines.map((line, i) => (
        // Line numbers are the identity here: the file doesn't change under the view.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <div key={i} className="src-line">
          <div className="ln">{i + 1}</div>
          <div className="content">{line}</div>
        </div>
      ))}
    </div>
  );
}

export function LoadingDiff() {
  return <div className="diff-note">Loading file diff…</div>;
}
