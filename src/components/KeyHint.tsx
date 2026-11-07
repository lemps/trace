import { useButtonHints, useHint } from "@/platform/shortcuts";

// A shortcut chip on a button, tab or header, shown only while Settings → Shortcuts'
// "Show shortcut hints on buttons" is on. The button's tooltip names the shortcut
// either way (`useTitleWithHint`), so the chip is hidden from screen readers.
export function KeyHint({ id, keys }: { id?: string; keys?: string }) {
  const on = useButtonHints();
  const bound = useHint(id ?? "");
  const text = keys ?? bound;
  if (!on || !text) return null;
  return (
    <span className="kbd" aria-hidden="true">
      {text}
    </span>
  );
}
