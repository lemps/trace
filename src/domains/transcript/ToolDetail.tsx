import { ChatMarkdown } from "@/domains/agentChat/ChatMarkdown";
import { DiffCard } from "@/domains/agentChat/DiffCard";
import { PlanCard } from "@/domains/agentChat/PlanCard";
import { commandOf, fields, planOf, str } from "@/domains/agentChat/toolSummary";
import type { FileDiff } from "@/domains/agentChat/types";
import type { ToolStep } from "./blocks";
import { ToolOutput } from "./ToolOutput";

// What an expanded tool row shows: the part of the call worth reading (the
// command, the edit, the task list) and what came back. Edits and task lists
// are the chat's own cards (`DiffCard`, `PlanCard`), so both views draw them alike.

/** Calls that answer in the agent's own Markdown: a subagent's report. */
const PROSE_RESULT = new Set(["Task", "Agent"]);

/** An Edit's change, or each of a MultiEdit's, as the chat's diff rows. */
function editDiffs(input: unknown): FileDiff[] {
  const path = str(input, "file_path");
  const one = (e: unknown): FileDiff => ({
    path,
    change: "edit",
    before: str(e, "old_string"),
    after: str(e, "new_string"),
  });
  const list = fields(input).edits;
  return Array.isArray(list) ? list.map(one) : [one(input)];
}

/** The call's own content: what it ran or wrote. */
function CallBody({ name, input }: { name: string; input: unknown }) {
  if (name === "Bash" || name === "PowerShell") {
    return <pre className="tx-code ac-cmd">{commandOf(input)}</pre>;
  }
  if (name === "Edit" || name === "MultiEdit") {
    return (
      <>
        {editDiffs(input).map((diff, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a call's edits never reorder
          <DiffCard key={i} diff={diff} />
        ))}
      </>
    );
  }
  if (name === "Write") {
    return <pre className="tx-code">{str(input, "content")}</pre>;
  }
  if (name === "TodoWrite") return <PlanCard plan={planOf(input)} bare />;
  if (name === "Read") return null;
  const prompt = str(input, "prompt");
  // A subagent's brief is the agent's own Markdown.
  if (prompt) {
    return (
      <div className="tx-code tx-prose">
        <ChatMarkdown text={prompt} />
      </div>
    );
  }
  return <pre className="tx-code">{JSON.stringify(input, null, 2)}</pre>;
}

export function ToolDetail({ step }: { step: ToolStep }) {
  const { call, result } = step;
  // Edits and todo lists report a bare "updated" — the call already says it all.
  const quietResult = ["Edit", "MultiEdit", "Write", "TodoWrite"].includes(call.name);
  return (
    <div className="tx-tool-detail">
      <CallBody name={call.name} input={call.input} />
      {result?.text && !result.isError && PROSE_RESULT.has(call.name) ? (
        <div className="tx-code tx-prose tx-result">
          <ChatMarkdown text={result.text} />
        </div>
      ) : (
        result?.text &&
        (!quietResult || result.isError) && (
          <ToolOutput text={result.text} failed={result.isError} />
        )
      )}
    </div>
  );
}
