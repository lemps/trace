import { type KeyboardEvent, useRef, useState } from "react";
import { I } from "@/components/Icon";
import { Markdown, NO_LINK_COMPONENTS } from "@/components/Markdown";
import { shownPreview } from "./previewPick";
import { QuestionPreview } from "./QuestionPreview";
import { splitRecommended } from "./recommended";
import type { Question } from "./types";

interface QuestionOptionsProps {
  question: Question;
  /** The labels picked so far, exactly as the agent wrote them. */
  picked: readonly string[];
  /** The id of the question's text, which names the group. */
  labelledBy: string;
  /** Pick (or, multi-select, toggle) an option by its original label. */
  onPick: (label: string) => void;
}

/** Which way an arrow key moves within a radio group; 0 for any other key. */
function stepOf(key: string): -1 | 0 | 1 {
  if (key === "ArrowDown" || key === "ArrowRight") return 1;
  if (key === "ArrowUp" || key === "ArrowLeft") return -1;
  return 0;
}

// A question's options, as buttons announced the way they behave: a single-select
// question is a radio group (one tab stop; the arrows move and pick, as radios do),
// a multi-select one a group of checkboxes. Each option shows its label (with a
// trailing "(Recommended)" as a quiet tag) and its description flowing after it,
// wrapping under the label. What's picked, and sent, is always the original label.
// Where options carry previews (a snippet, a mock-up), the one pointed at or focused
// shows beside them, else the picked one's: the agent words its question as if you
// can see them.
export function QuestionOptions({ question: q, picked, labelledBy, onPick }: QuestionOptionsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pointed, setPointed] = useState<number | null>(null);
  const preview = shownPreview(q.options, picked, pointed);
  const single = !q.multiSelect;
  const anyPicked = q.options.some((o) => picked.includes(o.label));
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = single ? stepOf(e.key) : 0;
    if (step === 0) return;
    e.preventDefault();
    const n = q.options.length;
    const next = (index + step + n) % n;
    const option = q.options[next];
    if (!option) return;
    refs.current[next]?.focus();
    onPick(option.label);
  };
  const options = (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is radiogroup or group, which both take a label
    // biome-ignore lint/a11y/noStaticElementInteractions: only forgets which option the pointer was on; the options are the buttons
    <div
      className="ac-q-options"
      role={single ? "radiogroup" : "group"}
      aria-labelledby={labelledBy}
      onMouseLeave={() => setPointed(null)}
    >
      {q.options.map((o, i) => {
        const on = picked.includes(o.label);
        const shown = splitRecommended(o.label);
        // One tab stop in a radio group: the picked option, or the first.
        const tabStop = !single || on || (!anyPicked && i === 0);
        return (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is radio or checkbox, which both take aria-checked
          <button
            key={o.label}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={single ? "radio" : "checkbox"}
            aria-checked={on}
            tabIndex={tabStop ? 0 : -1}
            className={`ac-q-option${on ? " on" : ""}${single ? "" : " multi"}`}
            onClick={() => onPick(o.label)}
            onKeyDown={(e) => onKeyDown(e, i)}
            onMouseEnter={() => setPointed(i)}
            onFocus={() => setPointed(i)}
            onBlur={() => setPointed(null)}
          >
            <span className="ac-q-mark">{on && <I.Check size={12} />}</span>
            <span className="ac-q-body">
              <span className="ac-q-label">
                <Markdown text={shown.label} prose inline components={NO_LINK_COMPONENTS} />
              </span>
              {shown.recommended && <span className="ac-q-rec">Recommended</span>}
              {o.description && (
                <span className="ac-q-desc">
                  <Markdown text={o.description} prose inline components={NO_LINK_COMPONENTS} />
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
  if (!preview) return options;
  return (
    <div className="ac-q-split">
      {options}
      <QuestionPreview label={splitRecommended(preview.label).label} text={preview.text} />
    </div>
  );
}
