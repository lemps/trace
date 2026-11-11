import { useState } from "react";
import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";
import { resolvePath } from "@/domains/agentChat/chatContext";
import { toolGlyph } from "@/domains/agentChat/toolGlyph";
import { summarizeTool } from "@/domains/agentChat/toolSummary";
import { useAppearance } from "@/domains/appearance/store";
import type { ToolStep } from "./blocks";
import { FileLink } from "./FileLink";
import { ToolDetail } from "./ToolDetail";

interface ToolRowProps {
  step: ToolStep;
  workspaceId: string;
  root: string | null;
  /** The agent is mid-turn, so a call without a result is still running. */
  isLive: boolean;
}

// One tool call as one line — what it did, to what, in the chat's words
// (`summarizeTool`) — that unfolds to the command, the edit or the output.
// Folded unless Appearance says to open tool activity: the line is the point.
export function ToolRow({ step, workspaceId, root, isLive }: ToolRowProps) {
  const tools = useAppearance((s) => s.prefs.chat.tools);
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? tools === "expanded";
  const { call, result } = step;
  const summary = summarizeTool(call.name, call.input);
  const Glyph = toolGlyph(call.name, summary.category);
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
          <Glyph size={12} />
          <span className="tx-tool-name">{summary.label}</span>
          {!summary.path && summary.target && (
            <span className={`tx-tool-target${summary.isCode ? " code" : ""}`}>
              {summary.target}
            </span>
          )}
        </button>
        {summary.path && (
          <FileLink workspaceId={workspaceId} path={resolvePath(summary.path, root)} root={root} />
        )}
        {failed && <span className="tx-tool-state error">Failed</span>}
        {pending && isLive && (
          <span className="tx-tool-state">
            <StatusLight light="working" variant="word" />
          </span>
        )}
      </div>
      {open && <ToolDetail step={step} />}
    </div>
  );
}
