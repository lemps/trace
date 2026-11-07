import type { createLowlight } from "lowlight";
import { useSyncExternalStore } from "react";

// Syntax highlighting for fenced code, loaded on first use: lowlight (the
// highlight.js grammars, emitting a tree rather than HTML) with its "common"
// set of ~35 languages, in its own chunk so a page with no code never pays
// for it. Until it has loaded, blocks show as plain text; after, highlighting
// is synchronous, so a block that's still streaming re-highlights in the same
// render as its new text and never flashes plain.

type Lowlight = ReturnType<typeof createLowlight>;

let lowlight: Lowlight | null = null;
let loading = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loading) return;
  loading = true;
  void import("lowlight")
    .then(({ common, createLowlight: create }) => {
      lowlight = create(common);
      for (const l of listeners) l();
    })
    .catch(() => {
      // Highlighting is a nicety: without it code stays plain. Allow a retry.
      loading = false;
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

/** The highlighter once loaded (null before); mounting the first user starts the load. */
export function useHighlighter(): Lowlight | null {
  return useSyncExternalStore(
    subscribe,
    () => lowlight,
    () => null
  );
}

/** The structural part of a hast tree that lowlight produces: spans and text. */
export interface HastNode {
  type: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: readonly HastNode[];
}

/** The language a fence names (`language-ts` → "ts"), lower-cased. */
export function fenceLanguage(className: unknown): string | null {
  const names = Array.isArray(className)
    ? className
    : typeof className === "string"
      ? className.split(/\s+/)
      : [];
  for (const n of names) {
    if (typeof n === "string" && n.startsWith("language-")) {
      return n.slice("language-".length).toLowerCase() || null;
    }
  }
  return null;
}

/** All the text under a node. */
export function textOfNode(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOfNode).join("");
}

/** A highlighted tree, or null when the language isn't one it knows. */
export function highlightCode(hl: Lowlight, lang: string, code: string): HastNode[] | null {
  if (!hl.registered(lang)) return null;
  try {
    return hl.highlight(lang, code).children;
  } catch {
    return null;
  }
}
