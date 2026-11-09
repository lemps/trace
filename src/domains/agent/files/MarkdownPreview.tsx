import { useMemo } from "react";
import { ChatMarkdown } from "@/domains/agentChat/ChatMarkdown";
import { ChatViewContext } from "@/domains/agentChat/chatContext";
import { useWorkspaceRoot } from "@/domains/agentChat/hooks/useWorkspaceRoot";

// A Markdown file's Preview, drawn the way the Plan tab draws a document: the
// chat's prose styles (Settings → Appearance → Chat & transcript), file links
// that open in an editor, on a reading column centred in the pane.
export function MarkdownPreview({ workspaceId, text }: { workspaceId: string; text: string }) {
  const root = useWorkspaceRoot(workspaceId);
  const view = useMemo(() => ({ workspaceId, root, expandAll: false }), [workspaceId, root]);
  return (
    <ChatViewContext.Provider value={view}>
      <div className="md-doc">
        <ChatMarkdown text={text} />
      </div>
    </ChatViewContext.Provider>
  );
}
