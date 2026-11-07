import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Markdown } from "@/components/Markdown";
import type { PlanDoc } from "@/ipc/plans";
import { SOURCE_LABEL } from "./model";
import { fullTime } from "./time";

// A document as paper: title, version, source and date over its content, in the
// light theme whatever trace's is, and nothing of the app around it. It's only in
// the page while printing; `plans-print.css` shows it, and nothing else, in print.
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
        <h1>{doc.title}</h1>
        <div className="plan-print-meta">
          {SOURCE_LABEL[doc.source]} · version {doc.version} · {fullTime(doc.createdAt)}
        </div>
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
        <Markdown text={doc.body} className="plan-print-md" />
      )}
    </div>,
    document.body
  );
}
