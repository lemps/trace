import { I } from "@/components/Icon";
import { Markdown } from "@/components/Markdown";
import { PromptBubble } from "@/domains/transcript/PromptBubble";
import type { ChatStyle } from "../chatStyle";
import { useAppearance } from "../store";
import { PreviewFrame } from "./PreviewFrame";

// Settings → Appearance → Chat & transcript: a short exchange drawn with the
// chat's own pieces — the real prompt bubble, its tool fold and tool lines, and
// the real Markdown renderer for a reply with a heading, a list, a table and
// highlighted code. Its column is the chat's (`.tx-col.ac-col` in a turn), so
// Compact density's chat layout (agentChat/compact.css) applies here too, and
// it reads the same --chat-* properties as every Markdown surface.

const REPLY = `## Dark variant added
The code block now follows **Appearance**, using \`--bg-1\` from the tokens.

- Tokens for both schemes
- [x] Light theme checked
- [ ] Screenshots

| Theme | Contrast |
| --- | --- |
| Light | 7.1 : 1 |
| Dark | 15.3 : 1 |

\`\`\`ts
// one per scheme
const t = dark ? "dusk" : "paper";
export default t;
\`\`\``;

const CALLS = [
  { glyph: I.File, name: "Read", target: "src/styles/tokens.css" },
  { glyph: I.Pencil, name: "Edit", target: "src/styles/themes.css" },
  { glyph: I.Terminal, name: "Ran", target: "npm test" },
];

const WIDTH_WORD: Record<ChatStyle["width"], string> = {
  readable: "Readable (820px)",
  wide: "Wide (1100px)",
  full: "Full pane",
};

/** The turn's work as the setting first shows it: folded, a line per call, or the last one open. */
function ToolActivity({ tools }: { tools: ChatStyle["tools"] }) {
  const open = tools !== "folded";
  return (
    <>
      <div className={`ac-fold${open ? " open" : ""}`}>
        <button type="button" className="ac-fold-head" aria-expanded={open}>
          <span className="tx-chev">
            <I.Chevron size={12} />
          </span>
          <span className="ac-fold-sentence">Read a file, edited a file and ran a command</span>
          <span className="tx-run-count">3</span>
        </button>
      </div>
      {open &&
        CALLS.map((c, i) => {
          const expanded = tools === "expanded" && i === CALLS.length - 1;
          return (
            <div key={c.name} className={`ac-tool${expanded ? " open" : ""}`}>
              <div className="tx-tool-line">
                <button type="button" className="tx-tool-toggle" aria-expanded={expanded}>
                  <span className="tx-chev">
                    <I.Chevron size={12} />
                  </span>
                  <c.glyph size={12} />
                  <span className="tx-tool-name">{c.name}</span>
                  <span className="tx-tool-target code">{c.target}</span>
                </button>
              </div>
              {expanded && (
                <div className="ac-tool-body">
                  <pre className="tx-code ac-cmd">npm test</pre>
                  <pre className="tx-code tx-result">✓ 214 tests passed</pre>
                </div>
              )}
            </div>
          );
        })}
    </>
  );
}

export function ChatPreview() {
  const chat = useAppearance((s) => s.prefs.chat);
  return (
    <PreviewFrame kind="chat" caption={`Reading width: ${WIDTH_WORD[chat.width]}`}>
      <div className={`tx-col ac-col ap-chat-col ${chat.width}`}>
        <div className="ac-turn">
          <PromptBubble>
            <Markdown text="Can you add a **dark** variant?" prose />
          </PromptBubble>
          <ToolActivity tools={chat.tools} />
          <div className="ac-reply">
            <Markdown text={REPLY} prose />
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}
