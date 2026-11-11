import { Markdown } from "@/components/Markdown";
import { previewIsMarkdown } from "./previewPick";

interface QuestionPreviewProps {
  /** The option it shows, named above it. */
  label: string;
  text: string;
}

// What picking an option would look like: the agent's snippet or mock-up, beside
// the options (below them in a narrow card). A fenced block draws as code in the
// code theme; anything else exactly as written, in mono, so a mock-up keeps its shape.
export function QuestionPreview({ label, text }: QuestionPreviewProps) {
  return (
    <div className="ac-q-preview" aria-live="polite">
      <div className="ac-q-preview-label">{label}</div>
      {previewIsMarkdown(text) ? (
        <Markdown text={text} prose />
      ) : (
        <pre className="tx-code ac-q-preview-text">{text}</pre>
      )}
    </div>
  );
}
