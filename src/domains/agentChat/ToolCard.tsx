import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";
import { useAppearance } from "@/domains/appearance/store";
import { FileLink } from "@/domains/transcript/FileLink";
import { ApprovalCard } from "./ApprovalCard";
import { resolvePath, useChatView } from "./chatContext";
import { DiffCard } from "./DiffCard";
import { useDisclosure } from "./hooks/useDisclosure";
import type { ToolItem } from "./projection";
import { ToolBody } from "./ToolBody";
import { toolGlyph } from "./toolGlyph";
import { summarizeTool } from "./toolSummary";

// One tool call as one line (what it did, to what) that unfolds to its input
// and output. Its permission request sits under the line, its file changes as
// diff cards below it. A call that starts a subagent is a `SubagentCard` instead.
export function ToolCard({ item }: { item: ToolItem }) {
  const { workspaceId, root } = useChatView();
  const tools = useAppearance((s) => s.prefs.chat.tools);
  const [open, toggle] = useDisclosure(tools === "expanded");
  const { call, approval, diffs } = item;
  const summary = summarizeTool(call.name, call.input);
  const Glyph = toolGlyph(call.name, summary.category);
  return (
    <div className={`ac-tool${open ? " open" : ""}${call.state === "failed" ? " failed" : ""}`}>
      <div className="tx-tool-line">
        <button type="button" className="tx-tool-toggle" aria-expanded={open} onClick={toggle}>
          <span className="tx-chev">
            <I.Chevron size={12} />
          </span>
          <Glyph size={13} />
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
        <ToolState item={item} />
      </div>
      {open && <ToolBody call={call} hasDiff={diffs.length > 0} />}
      {approval && (
        <div className="ac-tool-attached">
          <ApprovalCard approval={approval.approval} attached />
        </div>
      )}
      {diffs.length > 0 && (
        <div className="ac-tool-attached">
          {diffs.map((d) => (
            <DiffCard key={d.row.id} diff={d.diff} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A call's state at the end of its line: the agent-state light while it runs or asks, "Failed" if it failed. */
function ToolState({ item }: { item: ToolItem }) {
  const { state } = item.call;
  if (state === "failed") return <span className="tx-tool-state error">Failed</span>;
  if (state !== "running") return null;
  const asks = item.approval && !item.approval.approval.resolution;
  return (
    <span className="tx-tool-state">
      <StatusLight light={asks ? "attention" : "working"} variant="word" />
    </span>
  );
}
