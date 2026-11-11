import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Markdown } from "@/components/Markdown";
import type { PlanDoc } from "@/ipc/plans";
import { SOURCE_LABEL } from "./model";
import { HtmlPrint } from "./print/HtmlPrint";
import { fullTime } from "./time";

// A document as paper: one quiet line (title · source · version · date) over its
// content, in the light theme whatever trace's is, and nothing of the app around
// it. It's only in the page while printing; `plans-print.css` shows it, and nothing
// else, in print. Markdown is `prose`, so it reads as the Plan tab does (Settings →
// Appearance → Chat & transcript), at a paper size. It's the plain renderer, not
// ChatMarkdown: a file path stays text rather than becoming a FileLink button, which
// paper would hide along with every other control. HTML is its sanitised copy in
// the page (`print/HtmlPrint`), so it breaks across pages too.
export function PrintSheet({ doc, onReady }: { doc: PlanDoc; onReady: () => void }) {
  useEffect(() => {
    if (doc.format === "html") return;
    // Two frames: React has committed and the browser has laid the sheet out.
    const id = requestAnimationFrame(() => requestAnimationFrame(onReady));
    return () => cancelAnimationFrame(id);
  }, [doc, onReady]);

  return createPortal(
    <div className="plan-print" data-theme="light" data-code-theme="github-light">
      <header className="plan-print-head">
        <span className="plan-print-title">{doc.title}</span>
        {` · ${SOURCE_LABEL[doc.source]} · version ${doc.version} · ${fullTime(doc.createdAt)}`}
      </header>
      {doc.format === "html" ? (
        <HtmlPrint html={doc.body} title={doc.title} onReady={onReady} />
      ) : (
        <Markdown text={doc.body} prose />
      )}
    </div>,
    document.body
  );
}
