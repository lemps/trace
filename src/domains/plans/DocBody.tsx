import { ChatMarkdown } from "@/domains/agentChat/ChatMarkdown";
import type { PlanDoc } from "@/ipc/plans";

// A document's content. Markdown goes through the shared renderer with the
// chat's prose styles (no raw HTML, so nothing in it can run). HTML renders in an
// iframe with `sandbox=""`, the strictest setting: no scripts, an opaque origin,
// no forms or popups, so an agent's page can style itself but never reach trace.
export function DocBody({ doc }: { doc: PlanDoc }) {
  if (doc.format === "html") {
    return (
      <iframe key={doc.id} className="pl-frame" sandbox="" srcDoc={doc.body} title={doc.title} />
    );
  }
  return (
    <div className="pl-body">
      <div className="pl-prose">
        <ChatMarkdown text={doc.body} />
      </div>
    </div>
  );
}
