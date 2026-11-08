import { memo, type ReactNode, useMemo, useState } from "react";
import { I } from "@/components/Icon";
import { type HastNode, highlightCode, useHighlighter } from "./highlight";

// A fenced code block: the language and a copy button in a quiet head, the
// code highlighted in the code theme (styles/code-themes.css). Memoised on its
// text, so while a reply streams only the block being written re-renders.

function render(nodes: readonly HastNode[]): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.type === "text") return n.value ?? "";
    if (n.type !== "element") return null;
    const cls = n.properties?.className;
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: a highlighted line's spans are positional
      <span key={i} className={Array.isArray(cls) ? cls.join(" ") : undefined}>
        {render(n.children ?? [])}
      </span>
    );
  });
}

/** Copies `text`, then shows a check for a moment. Also on tool output (`transcript/ToolOutput`). */
export function CopyButton({ text, label = "Copy code" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => {}
    );
  };
  return (
    <button
      type="button"
      className="md-code-copy"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : "Copy"}
      onClick={copy}
    >
      {copied ? <I.Check size={12} /> : <I.Copy size={12} />}
    </button>
  );
}

interface CodeBlockProps {
  code: string;
  lang: string | null;
}

export const CodeBlock = memo(function CodeBlock({ code, lang }: CodeBlockProps) {
  const hl = useHighlighter();
  const tree = useMemo(() => (hl && lang ? highlightCode(hl, lang, code) : null), [hl, lang, code]);
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span className="md-code-lang">{lang ?? ""}</span>
        <CopyButton text={code} />
      </div>
      <pre>
        <code className={lang ? `language-${lang}` : undefined}>{tree ? render(tree) : code}</code>
      </pre>
    </div>
  );
});
