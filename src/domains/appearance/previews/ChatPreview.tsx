import { I } from "@/components/Icon";
import { Markdown } from "@/components/Markdown";
import type { ChatStyle } from "../chatStyle";
import { useAppearance } from "../store";

// Settings → Appearance → Chat & transcript: a short exchange drawn with the
// chat's own classes and the real Markdown renderer — your message, the
// agent's tool activity as the setting would first show it, and a reply with
// a heading, a list, a table and highlighted code. It reads the same --chat-*
// properties as every Markdown surface, so it changes as the settings do.

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

function ToolActivity({ tools }: { tools: ChatStyle["tools"] }) {
  const open = tools !== "folded";
  return (
    <div className={`ac-fold${open ? " open" : ""}`}>
      <div className="ac-fold-head">
        <span className="tx-chev">
          <I.Chevron size={12} />
        </span>
        <span className="ac-fold-sentence">Read a file, edited a file and ran a command</span>
        <span className="tx-run-count">3</span>
      </div>
      {open && (
        <div className="ac-fold-rows">
          {CALLS.map((c, i) => {
            const expanded = tools === "expanded" && i === 2;
            return (
              <div key={c.name} className={`ac-tool${expanded ? " open" : ""}`}>
                <div className="tx-tool-line">
                  <span className="tx-tool-toggle">
                    <span className="tx-chev">
                      <I.Chevron size={12} />
                    </span>
                    <c.glyph size={12} />
                    <span className="tx-tool-name">{c.name}</span>
                    <span className="tx-tool-target code">{c.target}</span>
                  </span>
                </div>
                {expanded && (
                  <div className="ac-tool-body">
                    <pre className="tx-code tx-result">✓ 214 tests passed</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChatPreview() {
  const chat = useAppearance((s) => s.prefs.chat);
  return (
    <div className="ap-chat-pv" inert aria-hidden="true">
      <div className={`ap-chat-col ${chat.width}`}>
        <div className="tx-prompt">
          <div className="tx-bubble">
            <Markdown text="Can you add a **dark** variant?" prose />
          </div>
        </div>
        <ToolActivity tools={chat.tools} />
        <div className="ac-reply">
          <Markdown text={REPLY} prose />
        </div>
      </div>
      <div className="ap-pv-caption">Column width: {WIDTH_WORD[chat.width]}</div>
    </div>
  );
}
