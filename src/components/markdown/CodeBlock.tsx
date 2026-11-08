import { memo, type ReactNode, useMemo } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { type HastNode, highlightCode, useHighlighter } from "./highlight";
import { useCopied } from "./useCopied";

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

interface CopyButtonProps {
  text: string;
  label?: string;
  /** Its look: the code block's head by default; a chat message has its own. */
  className?: string;
}

/** Copies `text`, then shows a check for a moment. Also on tool output and chat messages. */
export function CopyButton({
  text,
  label = "Copy code",
  className = "md-code-copy",
}: CopyButtonProps) {
  const [copied, flash] = useCopied();
  const copy = () => {
    void navigator.clipboard
      .writeText(text)
      .then(flash, () => toast.error("Couldn't copy to the clipboard"));
  };
  return (
    <IconButton
      size="xs"
      className={`ghost ${className}`}
      label={copied ? "Copied" : label}
      onClick={copy}
    >
      {copied ? <I.Check size={12} /> : <I.Copy size={12} />}
    </IconButton>
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
