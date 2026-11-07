import { useState } from "react";
import { I } from "@/components/Icon";
import { Markdown, NO_LINK_COMPONENTS } from "@/components/Markdown";
import { ChatMarkdown } from "./ChatMarkdown";
import { useAnswer } from "./hooks/useAnswer";
import type { Question, QuestionSet } from "./types";

// The agent asks you something, answered in place: each question's options
// (one, or several when it's multi-select), and a typed answer where allowed.
// Answered, it shows what you said.

type Picks = Record<string, string[]>;

export function QuestionCard({ questions: set }: { questions: QuestionSet }) {
  const { busy, submit } = useAnswer(set.requestId);
  const [picks, setPicks] = useState<Picks>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  if (set.resolution) return <Answered set={set} />;

  const answerOf = (q: Question): string[] => {
    const text = typed[q.id]?.trim();
    const chosen = picks[q.id] ?? [];
    if (!text) return chosen;
    return q.multiSelect ? [...chosen, text] : [text];
  };
  const ready = set.questions.every((q) => answerOf(q).length > 0);
  const pick = (q: Question, label: string) => {
    setPicks((p) => {
      const cur = p[q.id] ?? [];
      if (!q.multiSelect) return { ...p, [q.id]: [label] };
      return {
        ...p,
        [q.id]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label],
      };
    });
    if (!q.multiSelect) setTyped((t) => ({ ...t, [q.id]: "" }));
  };
  const send = () => {
    const answers: Picks = {};
    for (const q of set.questions) answers[q.id] = answerOf(q);
    submit({ kind: "questions", answers });
  };

  return (
    <div className="ac-card ac-ask ac-question">
      {set.questions.map((q) => (
        <fieldset key={q.id} className="ac-q" disabled={busy}>
          <legend className="ac-q-text">
            {q.header && <span className="ac-q-header">{q.header}</span>}
            <ChatMarkdown text={q.text} inline />
            {q.multiSelect && <span className="ac-card-meta">Pick any</span>}
          </legend>
          <div className="ac-q-options">
            {q.options.map((o) => {
              const on = (picks[q.id] ?? []).includes(o.label);
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={on}
                  className={`ac-q-option${on ? " on" : ""}${q.multiSelect ? " multi" : ""}`}
                  onClick={() => pick(q, o.label)}
                >
                  <span className="ac-q-mark">{on && <I.Check size={11} />}</span>
                  <span className="ac-q-label">
                    <Markdown text={o.label} prose inline components={NO_LINK_COMPONENTS} />
                  </span>
                  {o.description && (
                    <span className="ac-q-desc">
                      <Markdown text={o.description} prose inline components={NO_LINK_COMPONENTS} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {q.allowFreeText && (
            <input
              className="ac-q-input"
              placeholder={q.options.length > 0 ? "Or type your own answer" : "Type your answer"}
              value={typed[q.id] ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setTyped((t) => ({ ...t, [q.id]: value }));
                if (!q.multiSelect && value) setPicks((p) => ({ ...p, [q.id]: [] }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && ready) send();
              }}
            />
          )}
        </fieldset>
      ))}
      <div className="ac-ask-actions">
        <button
          type="button"
          className="btn primary-needs"
          disabled={!ready || busy}
          onClick={send}
        >
          <I.Send size={13} /> Answer
        </button>
      </div>
    </div>
  );
}

function Answered({ set }: { set: QuestionSet }) {
  const { resolution } = set;
  const answers =
    resolution?.state === "answered" && resolution.answer.kind === "questions"
      ? resolution.answer.answers
      : null;
  if (!answers) {
    return (
      <div className="ac-receipt">
        <I.X size={12} />
        <span className="ac-receipt-what">Question cancelled</span>
      </div>
    );
  }
  return (
    <div className="ac-card ac-answered">
      {set.questions.map((q) => (
        <div key={q.id} className="ac-answered-row">
          <span className="ac-answered-q">
            <ChatMarkdown text={q.text} inline />
          </span>
          <span className="ac-answered-a">
            {(answers[q.id] ?? []).map((a) => (
              <span key={a} className="ac-chip">
                {a}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
