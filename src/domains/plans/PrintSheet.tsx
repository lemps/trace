import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Markdown } from "@/components/Markdown";
import type { PlanDoc } from "@/ipc/plans";
import { SOURCE_LABEL } from "./model";
import { fullTime } from "./time";

// A document as paper: one quiet line (title · source · version · date) over its
// content, in the light theme whatever trace's is, and nothing of the app around
// it. It's only in the page while printing; `plans-print.css` shows it, and nothing
// else, in print. Markdown is `prose`, so it reads as the Plan tab does (Settings →
// Appearance → Chat & transcript), at a paper size. It's the plain renderer, not
// ChatMarkdown: a file path stays text rather than becoming a FileLink button, which
// paper would hide along with every other control.
export function PrintSheet({ doc, onReady }: { doc: PlanDoc; onReady: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (doc.format === "html") return;
    // Two frames: React has committed and the browser has laid the sheet out.
    const id = requestAnimationFrame(() => requestAnimationFrame(onReady));
    return () => cancelAnimationFrame(id);
  }, [doc, onReady]);

  // An HTML document prints at its full height, so the frame takes it on load.
  // Only this print copy may be read from here (allow-same-origin); scripts stay
  // off (no allow-scripts), so the page can't act on that.
  const onFrameLoad = () => {
    const el = frame.current;
    const height = el?.contentDocument?.documentElement.scrollHeight;
    if (el && height) el.style.height = `${height}px`;
    requestAnimationFrame(onReady);
  };

  return createPortal(
    <div className="plan-print" data-theme="light" data-code-theme="github-light">
      <header className="plan-print-head">
        <span className="plan-print-title">{doc.title}</span>
        {` · ${SOURCE_LABEL[doc.source]} · version ${doc.version} · ${fullTime(doc.createdAt)}`}
      </header>
      {doc.format === "html" ? (
        <iframe
          ref={frame}
          className="plan-print-frame"
          sandbox="allow-same-origin"
          srcDoc={doc.body}
          title={doc.title}
          onLoad={onFrameLoad}
        />
      ) : (
        <Markdown text={doc.body} prose />
      )}
    </div>,
    document.body
  );
}
