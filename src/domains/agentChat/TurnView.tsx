import { memo } from "react";
import { I } from "@/components/Icon";
import { formatDuration, workSentence } from "./format";
import { useDisclosure } from "./hooks/useDisclosure";
import { ItemView } from "./ItemView";
import { MessageRow } from "./MessageRow";
import type { ChatTurn } from "./projection";
import { TurnFooter } from "./TurnBits";

// One turn: your message, then what the agent did. Once it's finished, its
// work (thinking, tool calls, diffs, notes along the way) folds into one line
// above the answer, so a long conversation reads as questions and answers.

function TurnBody({ turn }: { turn: ChatTurn }) {
  return (
    <section className="ac-turn">
      {turn.prompts.map((p) => (
        <MessageRow key={p.row.id} message={p.message} />
      ))}
      {turn.folded.length > 0 && <Folded turn={turn} />}
      {turn.shown.map((item) => (
        <ItemView key={item.row.id} item={item} />
      ))}
      <TurnFooter turn={turn} />
    </section>
  );
}

function Folded({ turn }: { turn: ChatTurn }) {
  const [open, toggle] = useDisclosure(false);
  const ms = turn.summary?.durationMs;
  return (
    <div className={`ac-fold${open ? " open" : ""}`}>
      <button type="button" className="ac-fold-head" aria-expanded={open} onClick={toggle}>
        <span className="tx-chev">
          <I.Chevron size={12} />
        </span>
        <span className="ac-fold-sentence">{workSentence(turn.folded)}</span>
        {ms !== undefined && <span className="ac-fold-time">{formatDuration(ms)}</span>}
        <span className="tx-run-count">{turn.folded.length}</span>
      </button>
      {open && (
        <div className="ac-fold-rows">
          {turn.folded.map((item) => (
            <ItemView key={item.row.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Re-renders only when the turn's rows change (see `ChatTurn.version`). */
export const TurnView = memo(
  TurnBody,
  (a, b) => a.turn.id === b.turn.id && a.turn.version === b.turn.version
);
