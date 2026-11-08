import { ChatMarkdown } from "@/domains/agentChat/ChatMarkdown";
import type { ToolStep } from "./blocks";
import { ToolOutput } from "./ToolOutput";
import { str, todosOf } from "./toolSummary";

// What an expanded tool row shows: the part of the call worth reading (the
// command, the edit as a diff, the todo list) and what came back.

/** Calls that answer in the agent's own Markdown: a subagent's report. */
const PROSE_RESULT = new Set(["Task", "Agent"]);

function EditDiff({ before, after }: { before: string; after: string }) {
  return (
    <pre className="tx-code tx-diff">
      {before.split("\n").map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines of a fixed snapshot
        <span key={`o${i}`} className="del">
          {`- ${line}\n`}
        </span>
      ))}
      {after.split("\n").map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines of a fixed snapshot
        <span key={`n${i}`} className="add">
          {`+ ${line}\n`}
        </span>
      ))}
    </pre>
  );
}

function edits(input: unknown): { before: string; after: string }[] {
  const single = { before: str(input, "old_string"), after: str(input, "new_string") };
  if (single.before || single.after) return [single];
  const list =
    input && typeof input === "object" && "edits" in input
      ? (input as { edits: unknown }).edits
      : [];
  if (!Array.isArray(list)) return [];
  return list.map((e) => ({ before: str(e, "old_string"), after: str(e, "new_string") }));
}

/** The call's own content: what it ran or wrote. */
function CallBody({ name, input }: { name: string; input: unknown }) {
  if (name === "Bash" || name === "PowerShell") {
    return <pre className="tx-code">{str(input, "command")}</pre>;
  }
  if (name === "Edit" || name === "MultiEdit") {
    return (
      <>
        {edits(input).map((e, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a call's edits never reorder
          <EditDiff key={i} before={e.before} after={e.after} />
        ))}
      </>
    );
  }
  if (name === "Write") {
    return <pre className="tx-code">{str(input, "content")}</pre>;
  }
  if (name === "TodoWrite") {
    return (
      <ul className="tx-todos">
        {todosOf(input).map((t) => (
          <li key={t.content} className={t.status}>
            <ChatMarkdown text={t.content} inline />
          </li>
        ))}
      </ul>
    );
  }
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
