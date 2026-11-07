import { commandOf, patchOf, str } from "./toolSummary";
import type { ToolCall } from "./types";

// An expanded tool row: the part of the input worth reading (the command, the
// prompt, the patch; JSON for anything else) and what came back.

/** Output longer than this many lines is cut to its head and tail. */
const OUTPUT_LINES = 40;

function trimLines(text: string): string {
  const lines = text.split("\n");
  if (lines.length <= OUTPUT_LINES) return text;
  const half = OUTPUT_LINES / 2;
  return [
    ...lines.slice(0, half),
    `… ${lines.length - OUTPUT_LINES} more lines …`,
    ...lines.slice(-half),
  ].join("\n");
}

const RUN = new Set(["Bash", "PowerShell", "shell", "local_shell", "exec_command", "unified_exec"]);
/** Calls whose diff card already shows the change; their input would repeat it. */
const SHOWN_BY_DIFF = new Set(["Edit", "MultiEdit", "Write", "apply_patch", "NotebookEdit"]);
/** Calls whose summary line already says it all. */
const NO_INPUT = new Set(["Read", "read_file", "Glob", "Grep", "WebFetch", "WebSearch"]);

function InputView({ call, hasDiff }: { call: ToolCall; hasDiff: boolean }) {
  if (RUN.has(call.name)) {
    return <pre className="tx-code ac-cmd">{commandOf(call.input)}</pre>;
  }
  if (NO_INPUT.has(call.name) || (hasDiff && SHOWN_BY_DIFF.has(call.name))) return null;
  if (call.name === "apply_patch") return <pre className="tx-code">{patchOf(call.input)}</pre>;
  const prompt = str(call.input, "prompt");
  if (prompt) return <pre className="tx-code tx-prose">{prompt}</pre>;
  if (call.input === undefined || call.input === null) return null;
  return <pre className="tx-code">{JSON.stringify(call.input, null, 2)}</pre>;
}

export function ToolBody({ call, hasDiff }: { call: ToolCall; hasDiff: boolean }) {
  const failed = call.state === "failed";
  return (
    <div className="ac-tool-body">
      <InputView call={call} hasDiff={hasDiff} />
      {call.output ? (
        <pre className={`tx-code tx-result${failed ? " error" : ""}`}>{trimLines(call.output)}</pre>
      ) : (
        call.state !== "running" && <div className="ac-tool-none">No output</div>
      )}
    </div>
  );
}
