import { type ReactNode, useCallback, useRef, useState } from "react";
import { toast } from "@/app/toast";
import { exportPlanPdf, type PlanDoc } from "@/ipc/plans";
import { PrintSheet } from "./PrintSheet";

export interface PrintPdf {
  /** Render, while printing, the document's paper layout (portalled to <body>). */
  sheet: ReactNode;
  busy: boolean;
  run: (doc: PlanDoc) => Promise<void>;
}

/** How long a sheet may take to lay out (an HTML document's frame to load). */
const READY_MS = 5000;

// Save as PDF: put the document in its print layout (`plans-print.css` hides the
// app around it), then have the backend print the page to a file the user picks.
// On Windows WebView2 writes the PDF itself; where the webview can't, the system
// print dialog opens instead, which offers saving as PDF.
export function usePrintPdf(): PrintPdf {
  const [doc, setDoc] = useState<PlanDoc | null>(null);
  const ready = useRef<(() => void) | null>(null);
  const onReady = useCallback(() => ready.current?.(), []);

  const run = async (next: PlanDoc) => {
    if (doc) return;
    const laidOut = new Promise<void>((resolve) => {
      ready.current = resolve;
      setTimeout(resolve, READY_MS);
    });
    setDoc(next);
    try {
      await laidOut;
      const result = await exportPlanPdf(next.title);
      if (result.kind === "saved") toast.success(`Saved to ${result.path}`);
      else if (result.kind === "usePrintDialog") window.print();
    } catch (e) {
      toast.error(`Couldn't save the PDF: ${String(e)}`);
    } finally {
      ready.current = null;
      setDoc(null);
    }
  };

  const sheet = doc ? <PrintSheet doc={doc} onReady={onReady} /> : null;
  return { sheet, busy: doc !== null, run };
}
