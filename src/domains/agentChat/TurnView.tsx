import { memo } from "react";
import { I } from "@/components/Icon";
import { useAppearance } from "@/domains/appearance/store";
import { failedCount, formatDuration, workSentence } from "./format";
import { useDisclosure } from "./hooks/useDisclosure";
import { ItemView } from "./ItemView";
import { MessageRow } from "./MessageRow";
import type { ChatItem, ChatTurn } from "./projection";
import { TurnFooter } from "./TurnBits";

// One turn: your message, then what the agent did. Once it's finished, its
// work (thinking, tool calls, diffs, notes along the way) folds into one line
// above the answer, so a long conversation reads as questions and answers.
//
// Every item stays in one list, in order, under the same key from its first
// row to the end: folding only hides items, so nothing remounts (and no card
// forgets that you opened it) when a turn ends or its fold opens.

function TurnBody({ turn }: { turn: ChatTurn }) {
  // Settings → Appearance → Chat & transcript: "Folded" keeps a finished turn's work in one line.
  const tools = useAppearance((s) => s.prefs.chat.tools);
  const [open, toggle] = useDisclosure(tools !== "folded");
  const folded = turn.folded.length > 0;
  const hidden: ReadonlySet<ChatItem> = folded && !open ? new Set(turn.folded) : NONE;
  return (
    <section className="ac-turn" data-follow-id={turn.id}>
      {turn.prompts.map((p) => (
        <MessageRow key={p.row.id} message={p.message} at={p.row.at} />
      ))}
      {folded && <FoldHead turn={turn} open={open} toggle={toggle} />}
      {turn.items.map((item) =>
        hidden.has(item) ? null : <ItemView key={item.row.id} item={item} />
      )}
      <TurnFooter turn={turn} />
    </section>
  );
}

const NONE: ReadonlySet<ChatItem> = new Set();

function FoldHead({ turn, open, toggle }: { turn: ChatTurn; open: boolean; toggle: () => void }) {
  const ms = turn.summary?.durationMs;
  const failed = failedCount(turn.folded);
  return (
    <div className={`ac-fold${open ? " open" : ""}`}>
      <button type="button" className="ac-fold-head" aria-expanded={open} onClick={toggle}>
        <span className="tx-chev">
          <I.Chevron size={12} />
        </span>
        <span className="ac-fold-sentence">{workSentence(turn.folded)}</span>
        {failed > 0 && <span className="tx-tool-state error">{failed} failed</span>}
        {ms !== undefined && <span className="ac-fold-time">{formatDuration(ms)}</span>}
        <span className="tx-run-count">{turn.folded.length}</span>
      </button>
    </div>
  );
}

/** Re-renders only when the turn's rows change (see `ChatTurn.version`). */
export const TurnView = memo(
  TurnBody,
  (a, b) => a.turn.id === b.turn.id && a.turn.version === b.turn.version
);
