// A server's mark: a brand's single-colour icon (simple-icons, CC0) drawn in the theme's
// text colour, so dark marks show on a dark theme too; else its first letter on a tile.

const marks = import.meta.glob<string>("./mcpLogos/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

function markFor(id: string | null): string | null {
  return id ? (marks[`./mcpLogos/${id}.svg`] ?? null) : null;
}

export function McpLogo({ id, name }: { id: string | null; name: string }) {
  const mark = markFor(id);
  return (
    <span className="mcp-logo" aria-hidden="true">
      {mark ? (
        <span className="mcp-mark" style={{ maskImage: `url("${mark}")` }} />
      ) : (
        <span className="mcp-letter">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}
