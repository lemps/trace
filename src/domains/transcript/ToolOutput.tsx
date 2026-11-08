import { useMemo, useState } from "react";
import { CopyButton } from "@/components/markdown/CodeBlock";
import { trimLines } from "./trimLines";

// What a tool call returned, the same in the chat and the transcript. Long
// output shows its head and tail until asked for all of it ("Show all N lines",
// as a big diff does); Copy always takes the whole text, never the cut.

interface ToolOutputProps {
  text: string;
  /** The call failed: the output reads in the danger colour. */
  failed?: boolean;
}

export function ToolOutput({ text, failed = false }: ToolOutputProps) {
  const [all, setAll] = useState(false);
  const trimmed = useMemo(() => trimLines(text), [text]);
  const cut = trimmed.hidden > 0;
  return (
    <div className={`tx-output${all ? " all" : ""}`}>
      <pre className={`tx-code tx-result${failed ? " error" : ""}`}>
        {all ? text : trimmed.text}
      </pre>
      <span className="tx-output-copy">
        <CopyButton text={text} label="Copy output" />
      </span>
      {cut && (
        <button type="button" className="btn ghost tx-output-more" onClick={() => setAll(!all)}>
          {all ? "Show less" : `Show all ${trimmed.total} lines`}
        </button>
      )}
    </div>
  );
}
