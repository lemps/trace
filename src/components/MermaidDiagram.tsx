import { useEffect, useId, useState } from "react";
import { useColorScheme } from "@/domains/appearance/useThemeKey";

// A ```mermaid block drawn as a diagram, the way GitHub shows it. mermaid is
// ~1MB, so it's imported on first use (its own chunk) rather than shipped in
// the main bundle for the few comments that carry a diagram.

let ready: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  ready ??= import("mermaid").then(({ default: mermaid }) => {
    return mermaid;
  });
  return ready;
}

/** Configure mermaid for the app's scheme; it's global, so this runs before each render. */
function configure(mermaid: typeof import("mermaid").default, scheme: "dark" | "light") {
  // "strict": no click handlers or HTML labels — the source is untrusted
  // (a PR comment), and strict makes mermaid sanitize its own output.
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: scheme === "light" ? "default" : "dark",
  });
  return mermaid;
}

/** Render mermaid source; falls back to the source as code if it doesn't parse. */
export function MermaidDiagram({ source }: { source: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Diagrams are SVG with colours baked in, so a theme change redraws them.
  const scheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    loadMermaid()
      .then((mermaid) => configure(mermaid, scheme).render(id, source))
      .then(({ svg: out }) => {
        if (!cancelled) setSvg(out);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, source, scheme]);

  if (failed || svg === null) {
    return (
      <pre className={failed ? undefined : "mermaid-pending"}>
        <code>{source}</code>
      </pre>
    );
  }
  // mermaid's strict mode sanitizes the SVG it generates.
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by mermaid (securityLevel "strict")
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
