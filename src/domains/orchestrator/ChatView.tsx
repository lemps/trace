import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { Markdown } from "@/components/Markdown";
import { StatusLight } from "@/components/StatusLight";
import { useBoardStore } from "@/domains/board/store";
import { PromptBubble } from "@/domains/transcript/PromptBubble";
import { isShortcut } from "@/platform/shortcuts";
import { ActionCard, ConfirmCard } from "./ActionCard";
import { ChartBlock } from "./Chart";
import { type ChatMessage, useChatStore } from "./chatStore";
import { splitBlocks } from "./messageBlocks";
import { actionVerb } from "./mutations";

const QUICK = [
  "Summarize the sprint",
  "Chart the sprint progress",
  "What should I play next?",
  "What's blocked right now?",
  "Which agents are waiting on me?",
];

/** With no board connected there are no tickets: ask about the sessions. */
const QUICK_SESSIONS = [
  "What are my agents doing?",
  "Which agents are waiting on me?",
  "Chart my agents by state",
  "Which sessions have open PRs?",
];

const TOOL_LABEL: Record<string, string> = {
  get_ticket_details: "ticket details",
  get_agent_transcript: "an agent transcript",
};

// The orchestrator chat tab, drawn like the agent chat: your messages in its
// prompt bubble, replies as prose (Settings → Appearance → Chat & transcript),
// the working light while a turn runs, and its composer box with an icon Send.
// Streams the assistant reply token-by-token. State lives in chatStore; this is
// presentational. A turn can't be stopped (the CLI reply can't be aborted), so
// Send waits while one runs rather than turning into Stop.
export function ChatView() {
  const messages = useChatStore((s) => s.messages);
  const busy = useChatStore((s) => s.busy);
  const send = useChatStore((s) => s.send);
  const pendingConfirm = useChatStore((s) => s.pendingConfirm);
  const resolveConfirm = useChatStore((s) => s.resolveConfirm);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the newest content in view as it streams in. `messages` isn't read in
  // the body — it's the trigger: each streamed delta is a new array.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every message update to follow the stream
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Fit the box to its text, as the agent chat's composer does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the text changes
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const canSend = !busy && draft.trim() !== "";
  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    setDraft("");
    void send(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an IME is composing commits the candidate; it isn't a send.
    if (e.nativeEvent.isComposing) return;
    // Enter sends; Shift+Enter keeps the textarea's default newline.
    if (isShortcut("chatSend", e)) {
      e.preventDefault();
      submit(draft);
    }
  };

  const last = messages.length - 1;
  const hasBoard = useBoardStore((s) => s.data !== null);

  return (
    <div className="orch-chat">
      <div className="orch-msgs" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="orch-chat-intro">
            <I.Sparkles size={16} />
            <div className="t">{hasBoard ? "Ask about the board" : "Ask about your sessions"}</div>
            <div className="orch-quick">
              {(hasBoard ? QUICK : QUICK_SESSIONS).map((q) => (
                <button key={q} type="button" onClick={() => submit(q)} disabled={busy}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <Message key={m.id} msg={m} working={busy && i === last && !pendingConfirm} />
          ))
        )}
      </div>

      {pendingConfirm && (
        <ConfirmCard
          className="orch-confirm"
          summary={pendingConfirm.summary}
          verb={actionVerb(pendingConfirm.name)}
          onCancel={() => resolveConfirm(false)}
          onGo={() => resolveConfirm(true)}
        />
      )}

      <div className="orch-composer">
        <div className="ac-composer">
          <textarea
            ref={inputRef}
            className="ac-input"
            aria-label="Ask the orchestrator"
            placeholder="Ask the orchestrator…"
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="ac-composer-bar">
            <IconButton
              className="primary"
              label="Send"
              shortcut="chatSend"
              disabled={!canSend}
              onClick={() => submit(draft)}
            >
              <I.Send size={14} />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ msg, working }: { msg: ChatMessage; working: boolean }) {
  if (msg.role === "user") {
    return (
      <PromptBubble>
        <Markdown text={msg.text} prose />
      </PromptBubble>
    );
  }
  const tool = msg.tool ? `Reading ${TOOL_LABEL[msg.tool] ?? msg.tool}` : undefined;
  return (
    <div className="ac-reply">
      <AssistantBody text={msg.text} />
      {working && (
        <div className="ac-working">
          <StatusLight light="working" variant="word" label={tool} />
        </div>
      )}
    </div>
  );
}

// Render an assistant reply: markdown runs, with ```chart blocks drawn inline
// (deterministic data) and ```action blocks as confirm-gated action cards.
function AssistantBody({ text }: { text: string }) {
  if (!text) return null;
  return (
    <>
      {splitBlocks(text).map((p, i) => {
        // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and stable per render
        if (p.type === "chart") return <ChartBlock key={i} raw={p.raw} />;
        // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and stable per render
        if (p.type === "action") return <ActionCard key={i} raw={p.raw} />;
        // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and stable per render
        return p.text.trim() ? <Markdown key={i} text={p.text} prose /> : null;
      })}
    </>
  );
}
