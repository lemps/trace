import type { ReactNode } from "react";
import { I } from "@/components/Icon";
import { useAppearance } from "@/domains/appearance/store";
import { FileLink } from "@/domains/transcript/FileLink";
import { ApprovalCard } from "./ApprovalCard";
import { resolvePath, useChatView } from "./chatContext";
import { DiffCard } from "./DiffCard";
import { useDisclosure } from "./hooks/useDisclosure";
import type { ToolItem } from "./projection";
import { ToolBody } from "./ToolBody";
import { summarizeTool, type ToolCategory } from "./toolSummary";

type Glyph = (p: { size?: number }) => ReactNode;

const GLYPHS: Record<ToolCategory, Glyph> = {
  run: I.Terminal,
  read: I.File,
  edit: I.Pencil,
  search: I.Search,
  web: I.Download,
  agent: I.Sparkles,
  plan: I.Check,
  other: I.Code,
};

function glyphFor(name: string, category: ToolCategory): Glyph {
  return name.startsWith("mcp__") ? I.Plug : GLYPHS[category];
}

// One tool call as one line (what it did, to what) that unfolds to its input
// and output. Its permission request sits under the line, its file changes as
// diff cards below it. A call that starts a subagent is a `SubagentCard` instead.
export function ToolCard({ item }: { item: ToolItem }) {
  const { workspaceId, root } = useChatView();
  const tools = useAppearance((s) => s.prefs.chat.tools);
  const [open, toggle] = useDisclosure(tools === "expanded");
  const { call, approval, diffs } = item;
  const summary = summarizeTool(call.name, call.input);
  const Glyph = glyphFor(call.name, summary.category);
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

function ToolState({ item }: { item: ToolItem }) {
  const { state } = item.call;
  if (state === "failed") return <span className="tx-tool-state error">failed</span>;
  if (state === "running") {
    const waiting = item.approval && !item.approval.approval.resolution;
    return <span className="tx-tool-state">{waiting ? "waiting for you" : "running…"}</span>;
  }
  return null;
}
