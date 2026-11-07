import { type ReactNode, useState } from "react";
import { I } from "@/components/Icon";
import { useAppearance } from "@/domains/appearance/store";
import type { ToolStep } from "./blocks";
import { FileLink } from "./FileLink";
import { ToolDetail } from "./ToolDetail";
import { summarize } from "./toolSummary";

type Glyph = (p: { size?: number }) => ReactNode;

function glyphFor(name: string): Glyph {
  if (name === "Bash" || name === "PowerShell") return I.Terminal;
  if (["Read", "Edit", "MultiEdit", "Write", "NotebookEdit"].includes(name)) return I.File;
  if (name === "Grep" || name === "Glob" || name === "WebSearch") return I.Search;
  if (name === "Task" || name === "Agent") return I.Sparkles;
  if (name === "TodoWrite") return I.Check;
  if (name.startsWith("mcp__")) return I.Plug;
  return I.Code;
}

interface ToolRowProps {
  step: ToolStep;
  workspaceId: string;
  root: string | null;
  /** The agent is mid-turn, so a call without a result is still running. */
  isLive: boolean;
}

// One tool call as one line — what it did, to what — that unfolds to the
// command, the edit or the output. Folded unless Appearance says to open
// tool activity: the line is the point.
export function ToolRow({ step, workspaceId, root, isLive }: ToolRowProps) {
  const tools = useAppearance((s) => s.prefs.chat.tools);
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? tools === "expanded";
  const { call, result } = step;
  const summary = summarize(call.name, call.input);
  const Glyph = glyphFor(call.name);
  const failed = result?.isError ?? false;
  const pending = !result;
  return (
    <div className={`tx-tool${open ? " open" : ""}${failed ? " failed" : ""}`}>
      <div className="tx-tool-line">
        <button
          type="button"
          className="tx-tool-toggle"
          aria-expanded={open}
          onClick={() => setChoice(!open)}
        >
          <span className="tx-chev">
            <I.Chevron size={12} />
          </span>
          <Glyph size={13} />
          <span className="tx-tool-name">{summary.label}</span>
          {!summary.path && (
            <span className={`tx-tool-target${summary.isCode ? " code" : ""}`}>
              {summary.target}
            </span>
          )}
        </button>
        {summary.path && <FileLink workspaceId={workspaceId} path={summary.path} root={root} />}
        {failed && <span className="tx-tool-state error">failed</span>}
        {pending && isLive && <span className="tx-tool-state">running…</span>}
      </div>
      {open && <ToolDetail step={step} />}
    </div>
  );
}
