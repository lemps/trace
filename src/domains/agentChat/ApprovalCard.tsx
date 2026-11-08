import { I } from "@/components/Icon";
import { ChatMarkdown } from "./ChatMarkdown";
import { useAnswer } from "./hooks/useAnswer";
import type { Approval, ApprovalKind, ApprovalOption } from "./types";

// A permission request, answered in place: what the agent wants to do, then one
// button per option (allow once is the primary, deny the destructive one). Once
// resolved it shrinks to a one-line receipt of what was chosen.

interface ApprovalCardProps {
  approval: Approval;
  /** Drawn under its tool call's line, which already names the tool. */
  attached?: boolean;
}

const BUTTON: Record<ApprovalKind, string> = {
  allowOnce: "btn primary-needs",
  allowAlways: "btn",
  deny: "btn danger",
};

const RECEIPT: Record<ApprovalKind, string> = {
  allowOnce: "Allowed once",
  allowAlways: "Always allowed",
  deny: "Denied",
};

export function ApprovalCard({ approval, attached = false }: ApprovalCardProps) {
  const { busy, submit } = useAnswer(approval.requestId);
  const { resolution } = approval;
  if (resolution) return <Receipt approval={approval} />;
  return (
    <div className={`ac-card ac-ask${attached ? " attached" : ""}`}>
      <div className="ac-card-head">
        <I.Shield size={13} />
        <span className="ac-card-title">
          <ChatMarkdown text={approval.title} inline />
        </span>
        {!attached && <span className="ac-card-meta">{approval.tool}</span>}
      </div>
      {approval.detail && <pre className="tx-code ac-cmd">{approval.detail}</pre>}
      <div className="ac-ask-actions">
        {approval.options.map((o: ApprovalOption) => (
          <button
            key={o.id}
            type="button"
            className={BUTTON[o.kind]}
            disabled={busy}
            onClick={() => submit({ kind: "approval", optionId: o.id })}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Receipt({ approval }: { approval: Approval }) {
  const { resolution } = approval;
  if (!resolution) return null;
  let text = "Cancelled";
  let kind: ApprovalKind | null = null;
  let note: string | undefined;
  if (resolution.state === "answered" && resolution.answer.kind === "approval") {
    const { optionId } = resolution.answer;
    const option = approval.options.find((o) => o.id === optionId);
    kind = option?.kind ?? null;
    text = option ? RECEIPT[option.kind] : optionId;
    note = resolution.answer.note;
  }
  return (
    <div className={`ac-receipt${kind === "deny" ? " denied" : ""}`}>
      {kind === "deny" ? <I.X size={12} /> : <I.Check size={12} />}
      <span className="ac-receipt-what">{text}</span>
      <span className="ac-receipt-of">
        <ChatMarkdown text={approval.title} inline />
      </span>
      {note && <span className="ac-receipt-note">“{note}”</span>}
    </div>
  );
}
