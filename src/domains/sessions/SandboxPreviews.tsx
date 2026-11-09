import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { useBrowserStore } from "@/domains/browser/store";
import type { SandboxPreview } from "@/ipc/vercel";

interface SandboxPreviewsProps {
  sessionId: string;
  previews: SandboxPreview[];
}

// A running sandbox's preview URLs, one per port a dev server can use. Each opens
// in the session's Browser tab; an agent's `localhost:<port>` lands on the same
// page (`commands/sandbox_preview.rs`). They're public, so the note says so.
export function SandboxPreviews({ sessionId, previews }: SandboxPreviewsProps) {
  const openUrl = useBrowserStore((s) => s.openUrl);
  if (previews.length === 0) return null;
  const open = (url: string) => {
    openUrl(sessionId, url, true).catch((e: unknown) =>
      toast.error(`Couldn't open the preview: ${String(e)}`)
    );
  };
  return (
    <>
      {previews.map((p) => (
        <div className="ctx-row sandbox-preview" key={p.port}>
          <span className="k">Port {p.port}</span>
          <span className="v" title={p.url}>
            {new URL(p.url).host}
          </span>
          <IconButton
            size="xs"
            className="ghost"
            label="Open in the Browser tab"
            onClick={() => open(p.url)}
          >
            <I.Globe size={12} />
          </IconButton>
        </div>
      ))}
      <div className="sandbox-note">
        Dev servers on these ports are public at these addresses while the sandbox runs.
      </div>
    </>
  );
}
